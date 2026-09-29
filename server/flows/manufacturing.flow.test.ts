/**
 * Manufacturing process flow: raw materials → BOM → work order → reserve →
 * produce → finished goods.
 *
 * Every step runs through the live appRouter. The db module is an in-memory
 * store whose helpers mirror the contract of the real ones in server/db.ts
 * (same inputs, same return shapes, same defaults), so the router logic,
 * role gates and the cross-module handoffs are exercised for real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctxFor, qty } from "./_harness";

type Row = { id: number; [key: string]: unknown };

vi.mock("../db", async () => {
  const { table } = await import("./_harness");
  const { vi } = await import("vitest");

  const products = table<Row>();
  const rawMaterials = table<Row>();
  const rawMaterialInventory = table<Row>();
  const rawMaterialTransactions = table<Row>();
  const boms = table<Row>();
  const bomComponents = table<Row>();
  const bomVersionHistory = table<Row>();
  const workOrders = table<Row>();
  const workOrderMaterials = table<Row>();
  const workOrderOutputs = table<Row>();
  const inventoryLots = table<Row>();
  const inventoryBalances = table<Row>();
  const inventoryTransactions = table<Row>();
  const inventory = table<Row>();
  const auditLogs = table<Row>();

  const num = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
  // Reads return snapshots, as a SQL SELECT does — later writes must not mutate what a caller already holds.
  const snap = (r: Row | undefined) => (r ? { ...r } : r);
  const snapAll = (rows: Row[]) => rows.map((r) => ({ ...r }));

  // ---- products ----
  const createProduct = vi.fn(async (data: Row) => ({ id: products.insert({ status: "active", ...data }).id }));
  const getProductById = vi.fn(async (id: number) => snap(products.get(id)));

  // ---- raw materials + per-warehouse inventory ----
  const createRawMaterial = vi.fn(async (data: Row) => ({ id: rawMaterials.insert({ status: "active", ...data }).id }));
  const getRawMaterialById = vi.fn(async (id: number) => snap(rawMaterials.get(id)));
  const getRawMaterialInventory = vi.fn(async (filters?: { rawMaterialId?: number; warehouseId?: number }) =>
    snapAll(rawMaterialInventory.filter(
      (r) =>
        (!filters?.rawMaterialId || r.rawMaterialId === filters.rawMaterialId) &&
        (!filters?.warehouseId || r.warehouseId === filters.warehouseId),
    )));
  const getRawMaterialInventoryByLocation = vi.fn(async (rawMaterialId: number, warehouseId: number) =>
    snap(rawMaterialInventory.find((r) => r.rawMaterialId === rawMaterialId && r.warehouseId === warehouseId)));
  const upsertRawMaterialInventory = vi.fn(async (rawMaterialId: number, warehouseId: number, data: Row) => {
    const existing = rawMaterialInventory.find((r) => r.rawMaterialId === rawMaterialId && r.warehouseId === warehouseId);
    if (existing) {
      rawMaterialInventory.update(existing.id, data);
      return { id: existing.id };
    }
    const row = rawMaterialInventory.insert({
      rawMaterialId,
      warehouseId,
      unit: data.unit || "EA",
      quantity: "0.0000",
      reservedQuantity: "0.0000",
      availableQuantity: "0.0000",
      ...data,
    });
    return { id: row.id };
  });
  const createRawMaterialTransaction = vi.fn(async (data: Row) => ({ id: rawMaterialTransactions.insert(data).id }));

  // ---- bill of materials ----
  const getBomById = vi.fn(async (id: number) => snap(boms.get(id)));
  const createBom = vi.fn(async (data: Row) => ({ id: boms.insert({ version: "1.0", ...data }).id }));
  const updateBom = vi.fn(async (id: number, data: Row) => { boms.update(id, data); });
  const getBomComponents = vi.fn(async (bomId: number) =>
    snapAll(bomComponents.filter((c) => c.bomId === bomId).sort((a, b) => num(a.sortOrder) - num(b.sortOrder))));
  const createBomComponent = vi.fn(async (data: Row) => ({
    id: bomComponents.insert({ wastagePercent: "0.00", sortOrder: 0, ...data }).id,
  }));
  const updateBomComponent = vi.fn(async (id: number, data: Row) => { bomComponents.update(id, data); });
  const createBomVersionHistory = vi.fn(async (data: Row) => ({ id: bomVersionHistory.insert(data).id }));
  const getBomVersionHistory = vi.fn(async (bomId: number) => snapAll(bomVersionHistory.filter((h) => h.bomId === bomId)));
  // Mirrors db.calculateBomCosts: per-component total (qty × unit cost × (1 + wastage)),
  // then BOM material total + labor + overhead.
  const calculateBomCosts = vi.fn(async (bomId: number) => {
    const components = await getBomComponents(bomId);
    const bom = await getBomById(bomId);
    if (!bom) return null;
    let totalMaterialCost = 0;
    for (const comp of components) {
      const compCost = num(comp.quantity) * num(comp.unitCost) * (1 + num(comp.wastagePercent) / 100);
      totalMaterialCost += compCost;
      await updateBomComponent(comp.id, { totalCost: compCost.toFixed(2) });
    }
    const laborCost = num(bom.laborCost);
    const overheadCost = num(bom.overheadCost);
    const totalCost = totalMaterialCost + laborCost + overheadCost;
    await updateBom(bomId, { totalMaterialCost: totalMaterialCost.toFixed(2), totalCost: totalCost.toFixed(2) });
    return { totalMaterialCost, laborCost, overheadCost, totalCost };
  });

  // ---- work orders ----
  const getWorkOrderById = vi.fn(async (id: number) => snap(workOrders.get(id)));
  const createWorkOrder = vi.fn(async (data: Row) => {
    const workOrderNumber = `WO-${Date.now().toString(36).toUpperCase()}`;
    const row = workOrders.insert({ status: "draft", ...data, workOrderNumber });
    return { id: row.id, workOrderNumber };
  });
  const updateWorkOrder = vi.fn(async (id: number, data: Row) => { workOrders.update(id, data); });
  const getWorkOrderMaterials = vi.fn(async (workOrderId: number) => snapAll(workOrderMaterials.filter((m) => m.workOrderId === workOrderId)));
  const createWorkOrderMaterial = vi.fn(async (data: Row) => ({
    id: workOrderMaterials.insert({ consumedQuantity: "0.0000", ...data }).id,
  }));
  const updateWorkOrderMaterial = vi.fn(async (id: number, data: Row) => { workOrderMaterials.update(id, data); });
  // Mirrors db.generateWorkOrderMaterialsFromBom: scale each component by quantity / batchSize (+ wastage).
  const generateWorkOrderMaterialsFromBom = vi.fn(async (workOrderId: number, bomId: number, quantity: number) => {
    const components = await getBomComponents(bomId);
    const bom = await getBomById(bomId);
    if (!bom) throw new Error("BOM not found");
    const multiplier = quantity / (num(bom.batchSize) || 1);
    for (const comp of components) {
      const requiredQty = num(comp.quantity) * multiplier * (1 + num(comp.wastagePercent) / 100);
      await createWorkOrderMaterial({
        workOrderId,
        rawMaterialId: comp.rawMaterialId,
        productId: comp.productId,
        name: comp.name,
        requiredQuantity: requiredQty.toFixed(4),
        unit: comp.unit,
        status: "pending",
      });
    }
  });
  // Mirrors db.consumeWorkOrderMaterials: each line is consumed from the
  // warehouse its reservation was taken in (falling back to the work order's
  // own warehouse), and whatever was reserved but not consumed is released.
  const consumeWorkOrderMaterials = vi.fn(async (workOrderId: number, performedBy?: number) => {
    const workOrder = await getWorkOrderById(workOrderId);
    if (!workOrder) throw new Error("Work order not found");
    for (const mat of await getWorkOrderMaterials(workOrderId)) {
      if (!mat.rawMaterialId) continue;
      const requiredQty = num(mat.requiredQuantity);
      const alreadyConsumed = num(mat.consumedQuantity);
      const reservedQty = num(mat.reservedQuantity);
      const outstanding = Math.max(0, requiredQty - alreadyConsumed);
      const warehouseId = (mat.warehouseId as number | null | undefined) ?? (workOrder.warehouseId as number | null | undefined) ?? 0;
      const inv = await getRawMaterialInventoryByLocation(mat.rawMaterialId as number, warehouseId);
      if (!inv) {
        await updateWorkOrderMaterial(mat.id, { status: "shortage" });
        continue;
      }
      const currentQty = num(inv.quantity);
      const currentAvailable = inv.availableQuantity != null ? num(inv.availableQuantity) : currentQty;
      const consumeQty = Math.min(outstanding, currentQty);
      const newQty = currentQty - consumeQty;
      const newAvailable = Math.min(newQty, Math.max(0, currentAvailable + reservedQty - consumeQty));
      await upsertRawMaterialInventory(mat.rawMaterialId as number, warehouseId, {
        quantity: newQty.toFixed(4),
        availableQuantity: newAvailable.toFixed(4),
      });
      if (consumeQty > 0) {
        await createRawMaterialTransaction({
          rawMaterialId: mat.rawMaterialId,
          warehouseId,
          transactionType: "consume",
          quantity: (-consumeQty).toFixed(4),
          previousQuantity: currentQty.toFixed(4),
          newQuantity: newQty.toFixed(4),
          unit: mat.unit,
          referenceType: "work_order",
          referenceId: workOrderId,
          performedBy,
        });
      }
      const totalConsumed = alreadyConsumed + consumeQty;
      await updateWorkOrderMaterial(mat.id, {
        consumedQuantity: totalConsumed.toFixed(4),
        reservedQuantity: "0.0000",
        status: totalConsumed >= requiredQty ? "consumed" : "partial",
      });
    }
    await updateWorkOrder(workOrderId, { status: "completed", actualEndDate: new Date() });
  });

  // ---- finished goods (lots / balances / ledger) ----
  const createInventoryLot = vi.fn(async (data: Row) => {
    const lotCode = `LOT-${Date.now().toString(36).toUpperCase()}-TEST`;
    return { id: inventoryLots.insert({ ...data, lotCode }).id, lotCode };
  });
  const upsertInventoryBalance = vi.fn(
    async (lotId: number, productId: number, warehouseId: number, status: string, quantity: number, unit: string) => {
      const existing = inventoryBalances.find((b) => b.lotId === lotId && b.warehouseId === warehouseId && b.status === status);
      if (existing) {
        inventoryBalances.update(existing.id, { quantity: quantity.toString() });
        return { id: existing.id };
      }
      return { id: inventoryBalances.insert({ lotId, productId, warehouseId, binId: null, status, quantity: quantity.toString(), unit }).id };
    },
  );
  const createInventoryTransaction = vi.fn(async (data: Row) => {
    const transactionNumber = `TXN-${Date.now().toString(36).toUpperCase()}`;
    return { id: inventoryTransactions.insert({ ...data, transactionNumber }).id, transactionNumber };
  });
  // Mirrors db.addProductStock: upsert the aggregate product inventory row
  // (what inventory.list, transfers and scrap read), stamped with the entity.
  const addProductStock = vi.fn(async (productId: number, warehouseId: number, quantity: number, companyId?: number | null) => {
    const existing = inventory.find((r) => r.productId === productId && r.warehouseId === warehouseId);
    if (existing) {
      inventory.update(existing.id, { quantity: (num(existing.quantity) + quantity).toString() });
      return { created: false };
    }
    inventory.insert({ productId, warehouseId, quantity: quantity.toString(), companyId: companyId ?? null, reservedQuantity: "0" });
    return { created: true };
  });
  // Mirrors db.createWorkOrderOutput: new finished lot + output row + lot balance + receive ledger entry + aggregate stock.
  const createWorkOrderOutput = vi.fn(
    async (workOrderId: number, productId: number, quantity: number, warehouseId: number, yieldPercent?: number, performedBy?: number) => {
      const { id: lotId, lotCode } = await createInventoryLot({
        productId, productType: "finished", sourceType: "production", sourceReferenceId: workOrderId, status: "active", manufactureDate: new Date(),
      });
      const output = workOrderOutputs.insert({
        workOrderId, lotId, productId, quantity: quantity.toString(), yieldPercent: yieldPercent?.toString(), warehouseId, producedBy: performedBy,
      });
      await upsertInventoryBalance(lotId, productId, warehouseId, "available", quantity, "EA");
      await createInventoryTransaction({
        transactionType: "receive", lotId, productId, toWarehouseId: warehouseId, toStatus: "available",
        quantity: quantity.toString(), unit: "EA", newBalance: quantity.toString(),
        referenceType: "work_order", referenceId: workOrderId, performedBy, reason: "Production output",
      });
      const wo = await getWorkOrderById(workOrderId);
      const product = await getProductById(productId);
      await addProductStock(productId, warehouseId, quantity, (wo?.companyId as number | undefined) ?? (product?.companyId as number | undefined) ?? null);
      return { id: output.id, lotId, lotCode };
    },
  );

  // ---- side effects ----
  const createAuditLog = vi.fn(async (data: Row) => { auditLogs.insert(data); });
  const getUsersByRoles = vi.fn(async () => [{ id: 1 }, { id: 7 }]);
  const notifyUsersOfEvent = vi.fn(async () => ({ inApp: 2, email: 0 }));

  return {
    getDb: vi.fn().mockResolvedValue({}),
    __store: {
      products, rawMaterials, rawMaterialInventory, rawMaterialTransactions, boms, bomComponents, bomVersionHistory,
      workOrders, workOrderMaterials, workOrderOutputs, inventoryLots, inventoryBalances, inventoryTransactions, inventory, auditLogs,
    },
    createProduct, getProductById,
    createRawMaterial, getRawMaterialById, getRawMaterialInventory, getRawMaterialInventoryByLocation,
    upsertRawMaterialInventory, createRawMaterialTransaction,
    getBomById, createBom, updateBom, getBomComponents, createBomComponent, updateBomComponent,
    createBomVersionHistory, getBomVersionHistory, calculateBomCosts,
    getWorkOrderById, createWorkOrder, updateWorkOrder, getWorkOrderMaterials, createWorkOrderMaterial,
    updateWorkOrderMaterial, generateWorkOrderMaterialsFromBom, consumeWorkOrderMaterials,
    createInventoryLot, upsertInventoryBalance, createInventoryTransaction, addProductStock, createWorkOrderOutput,
    createAuditLog, getUsersByRoles, notifyUsersOfEvent,
  };
});

import * as db from "../db";
import { appRouter } from "../routers";

type Store = Record<string, ReturnType<typeof import("./_harness").table<Row>>>;
const store = (db as unknown as { __store: Store }).__store;

const ops = appRouter.createCaller(ctxFor("ops"));

const MAIN_WAREHOUSE = 1;
const OVERFLOW_WAREHOUSE = 2;

// Ids flow from one step to the next, exactly as a user's session would.
const ids = { flour: 0, sugar: 0, cookie: 0, bom: 0, workOrder: 0, lot: 0 };
let workOrderNumber = "";
let bigWorkOrderId = 0;

describe("manufacturing flow: raw materials → BOM → work order → production", () => {
  beforeEach(() => {
    // Keep state across steps; only reset call counters so each step asserts its own calls.
    vi.clearAllMocks();
  });

  it("step 1: ops sets up two raw materials with on-hand stock and a finished product", async () => {
    ids.flour = (await ops.rawMaterials.create({ name: "Flour", sku: "RM-FLOUR", unit: "kg", unitCost: "2.0000" })).id;
    ids.sugar = (await ops.rawMaterials.create({ name: "Sugar", sku: "RM-SUGAR", unit: "kg", unitCost: "3.0000" })).id;
    expect(ids.flour).toBe(1);
    expect(ids.sugar).toBe(2);

    // Flour is stocked in two warehouses, sugar only in the main one.
    await ops.rawMaterialInventory.adjust({ rawMaterialId: ids.flour, warehouseId: MAIN_WAREHOUSE, quantity: 200, unit: "kg" });
    await ops.rawMaterialInventory.adjust({ rawMaterialId: ids.flour, warehouseId: OVERFLOW_WAREHOUSE, quantity: 100, unit: "kg" });
    await ops.rawMaterialInventory.adjust({ rawMaterialId: ids.sugar, warehouseId: MAIN_WAREHOUSE, quantity: 50, unit: "kg" });

    const flourStock = await ops.rawMaterialInventory.list({ rawMaterialId: ids.flour });
    expect(flourStock.map((r) => [r.warehouseId, r.quantity, r.availableQuantity])).toEqual([
      [MAIN_WAREHOUSE, qty(200), qty(200)],
      [OVERFLOW_WAREHOUSE, qty(100), qty(100)],
    ]);
    // Each adjustment leaves an inventory ledger entry.
    expect(store.rawMaterialTransactions.all()).toHaveLength(3);
    expect(store.rawMaterialTransactions.get(1)).toMatchObject({
      rawMaterialId: ids.flour, warehouseId: MAIN_WAREHOUSE, transactionType: "adjust", quantity: qty(200), previousQuantity: qty(0), newQuantity: qty(200), performedBy: 1,
    });

    const product = await ops.products.create({
      name: "Cookie Box", sku: "FG-COOKIE", type: "physical", manufacturingStage: "finished_product", unitPrice: "9.99",
    });
    ids.cookie = product.id;
    expect(await ops.products.get({ id: ids.cookie })).toMatchObject({ name: "Cookie Box", sku: "FG-COOKIE", manufacturingStage: "finished_product" });
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "create", entityType: "product", entityId: ids.cookie, entityName: "Cookie Box", userId: 1 }));
  });

  it("step 2: a bill of materials for the product records per-unit quantities and rolls up cost", async () => {
    const bom = await ops.bom.create({
      productId: ids.cookie, name: "Cookie Box v1", version: "1.0", batchSize: "1", batchUnit: "EA", laborCost: "0.40", overheadCost: "0",
    });
    ids.bom = bom.id;

    await ops.bom.addComponent({
      bomId: ids.bom, componentType: "raw_material", rawMaterialId: ids.flour, name: "Flour", quantity: "0.5", unit: "kg", unitCost: "2.0000", sortOrder: 1,
    });
    await ops.bom.addComponent({
      bomId: ids.bom, componentType: "raw_material", rawMaterialId: ids.sugar, name: "Sugar", quantity: "0.2", unit: "kg", unitCost: "3.0000", sortOrder: 2,
    });

    const detail = await ops.bom.get({ id: ids.bom });
    expect(detail).not.toBeNull();
    expect(detail!.status).toBe("draft");
    expect(detail!.product).toMatchObject({ id: ids.cookie, name: "Cookie Box" });
    expect(detail!.components.map((c) => [c.name, c.quantity, c.unit, c.totalCost])).toEqual([
      ["Flour", "0.5", "kg", "1.00"],
      ["Sugar", "0.2", "kg", "0.60"],
    ]);
    // 0.5 kg × $2 + 0.2 kg × $3 = $1.60 material, + $0.40 labor = $2.00 per unit.
    expect(detail!.totalMaterialCost).toBe("1.60");
    expect(detail!.totalCost).toBe("2.00");
    expect(detail!.history.map((h) => h.changeType)).toEqual(["created"]);

    await ops.bom.update({ id: ids.bom, status: "active" });
    const activated = await ops.bom.get({ id: ids.bom });
    expect(activated!.status).toBe("active");
    expect(activated!.history.map((h) => h.changeType).sort()).toEqual(["activated", "created"]);
  });

  it("step 3: a work order for 100 units computes required materials from the BOM", async () => {
    const created = await ops.workOrders.create({
      bomId: ids.bom, productId: ids.cookie, warehouseId: MAIN_WAREHOUSE, quantity: "100", unit: "EA", priority: "high", notes: "Q4 run",
    });
    ids.workOrder = created.id;
    workOrderNumber = created.workOrderNumber;
    expect(workOrderNumber).toMatch(/^WO-[0-9A-Z]+$/);

    const wo = await ops.workOrders.getById({ id: ids.workOrder });
    expect(wo).toMatchObject({ bomId: ids.bom, productId: ids.cookie, warehouseId: MAIN_WAREHOUSE, quantity: "100", status: "draft", priority: "high", createdBy: 1 });

    const materials = await ops.workOrders.getMaterials({ workOrderId: ids.workOrder });
    expect(materials.map((m) => [m.name, m.rawMaterialId, m.requiredQuantity, m.unit, m.status])).toEqual([
      ["Flour", ids.flour, qty(50), "kg", "pending"],
      ["Sugar", ids.sugar, qty(20), "kg", "pending"],
    ]);
  });

  it("step 4: starting production reserves each material once, from the warehouse that covers it", async () => {
    const result = await ops.workOrders.startProduction({ id: ids.workOrder });
    expect(result).toEqual({ success: true });

    const wo = await ops.workOrders.getById({ id: ids.workOrder });
    expect(wo!.status).toBe("in_progress");
    expect(wo!.actualStartDate).toBeInstanceOf(Date);

    // Main warehouse covers the full 50 kg flour + 20 kg sugar, so the overflow
    // warehouse must be left alone. Before #420 the loop deducted the whole
    // requirement from every warehouse holding the material.
    expect(db.upsertRawMaterialInventory).toHaveBeenCalledTimes(2);
    expect(db.upsertRawMaterialInventory).toHaveBeenNthCalledWith(1, ids.flour, MAIN_WAREHOUSE, { availableQuantity: qty(150) });
    expect(db.upsertRawMaterialInventory).toHaveBeenNthCalledWith(2, ids.sugar, MAIN_WAREHOUSE, { availableQuantity: qty(30) });

    const flourStock = await ops.rawMaterialInventory.list({ rawMaterialId: ids.flour });
    expect(flourStock.map((r) => [r.warehouseId, r.quantity, r.availableQuantity])).toEqual([
      [MAIN_WAREHOUSE, qty(200), qty(150)], // on-hand untouched, available reduced by the reservation
      [OVERFLOW_WAREHOUSE, qty(100), qty(100)],
    ]);
    const sugarStock = await ops.rawMaterialInventory.list({ rawMaterialId: ids.sugar });
    expect(sugarStock[0]).toMatchObject({ quantity: qty(50), availableQuantity: qty(30) });

    const materials = await ops.workOrders.getMaterials({ workOrderId: ids.workOrder });
    expect(materials.map((m) => m.status)).toEqual(["reserved", "reserved"]);
  });

  it("step 5: completing production consumes raw materials and books finished goods into a new lot", async () => {
    const result = await ops.workOrders.completeProduction({ id: ids.workOrder, completedQuantity: "95", warehouseId: MAIN_WAREHOUSE });
    expect(result).toEqual({ success: true });

    // Raw materials leave the production warehouse (on-hand and available both drop).
    const flourStock = await ops.rawMaterialInventory.list({ rawMaterialId: ids.flour });
    expect(flourStock.map((r) => [r.warehouseId, r.quantity, r.availableQuantity])).toEqual([
      [MAIN_WAREHOUSE, qty(150), qty(150)],
      [OVERFLOW_WAREHOUSE, qty(100), qty(100)],
    ]);
    const sugarStock = await ops.rawMaterialInventory.list({ rawMaterialId: ids.sugar });
    expect(sugarStock[0]).toMatchObject({ quantity: qty(30), availableQuantity: qty(30) });

    const consumeTxns = store.rawMaterialTransactions.filter((t) => t.transactionType === "consume");
    expect(consumeTxns.map((t) => [t.rawMaterialId, t.quantity, t.previousQuantity, t.newQuantity, t.referenceType, t.referenceId, t.performedBy])).toEqual([
      [ids.flour, qty(-50), qty(200), qty(150), "work_order", ids.workOrder, 1],
      [ids.sugar, qty(-20), qty(50), qty(30), "work_order", ids.workOrder, 1],
    ]);

    const materials = await ops.workOrders.getMaterials({ workOrderId: ids.workOrder });
    expect(materials.map((m) => [m.status, m.consumedQuantity])).toEqual([
      ["consumed", qty(50)],
      ["consumed", qty(20)],
    ]);

    // Finished goods: one production lot of 95 EA in the main warehouse, plus a receive ledger entry.
    expect(db.createWorkOrderOutput).toHaveBeenCalledWith(ids.workOrder, ids.cookie, 95, MAIN_WAREHOUSE, 95, 1);
    const lots = store.inventoryLots.all();
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ productId: ids.cookie, productType: "finished", sourceType: "production", sourceReferenceId: ids.workOrder, status: "active" });
    ids.lot = lots[0].id;
    expect(store.inventoryBalances.all()).toEqual([
      expect.objectContaining({ lotId: ids.lot, productId: ids.cookie, warehouseId: MAIN_WAREHOUSE, status: "available", quantity: "95", unit: "EA" }),
    ]);
    expect(store.inventoryTransactions.all()).toEqual([
      expect.objectContaining({ transactionType: "receive", lotId: ids.lot, productId: ids.cookie, toWarehouseId: MAIN_WAREHOUSE, quantity: "95", referenceType: "work_order", referenceId: ids.workOrder, performedBy: 1 }),
    ]);
    expect(store.workOrderOutputs.all()).toEqual([
      expect.objectContaining({ workOrderId: ids.workOrder, lotId: ids.lot, productId: ids.cookie, quantity: "95", yieldPercent: "95", warehouseId: MAIN_WAREHOUSE, producedBy: 1 }),
    ]);
    // ...and the aggregate inventory row — what inventory.list, transfers and
    // scrap read. Before the fix only the lot moved, so produced goods were
    // invisible there.
    expect(db.addProductStock).toHaveBeenCalledWith(ids.cookie, MAIN_WAREHOUSE, 95, null);
    expect(store.inventory.all()).toEqual([expect.objectContaining({ productId: ids.cookie, warehouseId: MAIN_WAREHOUSE, quantity: "95" })]);

    // Work order closes with the actual quantity.
    const wo = await ops.workOrders.getById({ id: ids.workOrder });
    expect(wo).toMatchObject({ status: "completed", completedQuantity: "95" });
    expect(wo!.actualEndDate).toBeInstanceOf(Date);

    // Audit + notification side effects.
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "work_order", entityId: ids.workOrder, action: "update", userId: 1,
      newValues: expect.objectContaining({ event: "production_completed", completedQuantity: "95", yieldPercent: 95, outputLotId: ids.lot, outputLotCode: lots[0].lotCode }),
    }));
    expect(db.getUsersByRoles).toHaveBeenCalledWith(["admin", "ops", "exec"]);
    expect(db.notifyUsersOfEvent).toHaveBeenCalledTimes(1);
    expect(db.notifyUsersOfEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "work_order_completed",
        title: `Work Order ${workOrderNumber} Completed`,
        message: `Work Order ${workOrderNumber} completed with 95 units (95.0% yield)`,
        entityType: "work_order", entityId: ids.workOrder, severity: "info", metadata: { completedQuantity: 95, yieldPercent: 95 },
      }),
      [1, 7],
    );
  });

  it("step 6: yield below 90% is flagged as a warning; moisture math is available for weight adjustments", async () => {
    // A second, small run with poor yield: the notification severity escalates.
    const second = await ops.workOrders.create({ bomId: ids.bom, productId: ids.cookie, warehouseId: MAIN_WAREHOUSE, quantity: "10" });
    await ops.workOrders.startProduction({ id: second.id });
    vi.clearAllMocks();
    await ops.workOrders.completeProduction({ id: second.id, completedQuantity: "8" });
    expect(db.notifyUsersOfEvent).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "warning", message: expect.stringContaining("(80.0% yield)") }),
      [1, 7],
    );
    // An explicit yieldPercent is stored on the output rather than being derived.
    const third = await ops.workOrders.create({ bomId: ids.bom, productId: ids.cookie, warehouseId: MAIN_WAREHOUSE, quantity: "10" });
    await ops.workOrders.completeProduction({ id: third.id, completedQuantity: "10", yieldPercent: 97.5 });
    expect(store.workOrderOutputs.find((o) => o.workOrderId === third.id)).toMatchObject({ yieldPercent: "97.5" });

    // Moisture-basis conversion (used for dry-weight yield adjustments).
    expect(await ops.moisture.calculate({ wetWeight: 100, dryWeight: 80 })).toEqual({ moisturePct: 0.2, solidsPct: 0.8 });
    const converted = await ops.moisture.convert({ sourceWeight: 100, sourceMoisture: 0.2, targetMoisture: 0.1 });
    expect(converted.solids).toBeCloseTo(80, 6);
    expect(converted.targetWeight).toBeCloseTo(88.888888, 5);
    expect(converted.waterDelta).toBeCloseTo(-11.111111, 5);
  });

  it("regression #420: a requirement larger than one warehouse's stock reserves only the outstanding balance from the next", async () => {
    // Main warehouse flour: 200 − 50 (step 5) − 5 − 5 (step 6) = 140 kg on hand and available.
    const before = await ops.rawMaterialInventory.list({ rawMaterialId: ids.flour });
    const mainAvail = parseFloat(String(before.find((r) => r.warehouseId === MAIN_WAREHOUSE)!.availableQuantity));
    const overflowAvail = parseFloat(String(before.find((r) => r.warehouseId === OVERFLOW_WAREHOUSE)!.availableQuantity));
    expect(mainAvail).toBe(140);
    expect(overflowAvail).toBe(100);

    // Sugar: 50 − 20 − 2 − 2 = 26 kg on hand and the run needs 80, so top it up
    // (a genuine shortfall is the next test's subject).
    await ops.rawMaterialInventory.adjust({ rawMaterialId: ids.sugar, warehouseId: MAIN_WAREHOUSE, quantity: 60, unit: "kg" });

    // 400 units × 0.5 kg = 200 kg flour: 140 from main, the remaining 60 from overflow — not 200 from each.
    const big = await ops.workOrders.create({ bomId: ids.bom, productId: ids.cookie, warehouseId: MAIN_WAREHOUSE, quantity: "400" });
    bigWorkOrderId = big.id;
    vi.clearAllMocks();
    await ops.workOrders.startProduction({ id: big.id });

    const flourCalls = (db.upsertRawMaterialInventory as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === ids.flour);
    expect(flourCalls).toEqual([
      [ids.flour, MAIN_WAREHOUSE, { availableQuantity: qty(0) }],
      [ids.flour, OVERFLOW_WAREHOUSE, { availableQuantity: qty(40) }],
    ]);
    const after = await ops.rawMaterialInventory.list({ rawMaterialId: ids.flour });
    expect(after.map((r) => [r.warehouseId, r.availableQuantity])).toEqual([
      [MAIN_WAREHOUSE, qty(0)],
      [OVERFLOW_WAREHOUSE, qty(40)],
    ]);

    // The split is persisted on the material lines (one per source warehouse,
    // same total) so completion can consume — and release — the same stock.
    const materials = await ops.workOrders.getMaterials({ workOrderId: big.id });
    expect(materials.map((m) => [m.name, m.warehouseId, m.requiredQuantity, m.reservedQuantity, m.status])).toEqual([
      ["Flour", MAIN_WAREHOUSE, qty(140), qty(140), "reserved"],
      ["Sugar", MAIN_WAREHOUSE, qty(80), qty(80), "reserved"],
      ["Flour", OVERFLOW_WAREHOUSE, qty(60), qty(60), "reserved"],
    ]);
    expect((await ops.workOrders.getById({ id: big.id }))!.status).toBe("in_progress");
  });

  it("defect: a run the stock cannot cover is refused up front — nothing reserved, status untouched", async () => {
    // Flour available: main 0 + overflow 40 against 100 kg for 200 units; sugar 6 kg left against 40.
    const short = await ops.workOrders.create({ bomId: ids.bom, productId: ids.cookie, warehouseId: MAIN_WAREHOUSE, quantity: "200" });
    vi.clearAllMocks();
    await expect(ops.workOrders.startProduction({ id: short.id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Insufficient raw material stock to start production — Flour: short 60.0000 kg (required 100.0000, available 40.0000); Sugar: short 34.0000 kg (required 40.0000, available 6.0000)",
    });
    // Previously the status flipped to in_progress and the failure was only logged.
    expect((await ops.workOrders.getById({ id: short.id }))!.status).toBe("draft");
    expect(db.updateWorkOrder).not.toHaveBeenCalled();
    expect(db.upsertRawMaterialInventory).not.toHaveBeenCalled();
    expect(db.createWorkOrderMaterial).not.toHaveBeenCalled();
    expect((await ops.workOrders.getMaterials({ workOrderId: short.id })).map((m) => m.status)).toEqual(["pending", "pending"]);
    expect((await ops.rawMaterialInventory.list({ rawMaterialId: ids.flour })).map((r) => [r.warehouseId, r.availableQuantity])).toEqual([
      [MAIN_WAREHOUSE, qty(0)],
      [OVERFLOW_WAREHOUSE, qty(40)],
    ]);
  });

  it("defect: completing the split run consumes each reservation where it was taken", async () => {
    await ops.workOrders.completeProduction({ id: bigWorkOrderId, completedQuantity: "400" });

    // Flour leaves main (140 → 0) AND overflow (100 → 40); before the fix only
    // the work order's own warehouse was drawn down, so overflow kept its 100
    // on hand while its 60 kg reservation was never released.
    expect((await ops.rawMaterialInventory.list({ rawMaterialId: ids.flour })).map((r) => [r.warehouseId, r.quantity, r.availableQuantity])).toEqual([
      [MAIN_WAREHOUSE, qty(0), qty(0)],
      [OVERFLOW_WAREHOUSE, qty(40), qty(40)],
    ]);
    expect((await ops.rawMaterialInventory.list({ rawMaterialId: ids.sugar }))[0]).toMatchObject({ quantity: qty(6), availableQuantity: qty(6) });

    const consumeTxns = store.rawMaterialTransactions.filter((t) => t.transactionType === "consume" && t.referenceId === bigWorkOrderId);
    expect(consumeTxns.map((t) => [t.rawMaterialId, t.warehouseId, t.quantity, t.previousQuantity, t.newQuantity])).toEqual([
      [ids.flour, MAIN_WAREHOUSE, qty(-140), qty(140), qty(0)],
      [ids.sugar, MAIN_WAREHOUSE, qty(-80), qty(86), qty(6)],
      [ids.flour, OVERFLOW_WAREHOUSE, qty(-60), qty(100), qty(40)],
    ]);
    const materials = await ops.workOrders.getMaterials({ workOrderId: bigWorkOrderId });
    expect(materials.map((m) => [m.warehouseId, m.consumedQuantity, m.reservedQuantity, m.status])).toEqual([
      [MAIN_WAREHOUSE, qty(140), qty(0), "consumed"],
      [MAIN_WAREHOUSE, qty(80), qty(0), "consumed"],
      [OVERFLOW_WAREHOUSE, qty(60), qty(0), "consumed"],
    ]);
    expect(store.inventory.find((r) => r.productId === ids.cookie)!.quantity).toBe("513"); // 95 + 8 + 10 + 400
  });

  it("defect: a reservation the run does not fully use is released back to available on completion", async () => {
    // 20 units: 10 kg flour (main is empty, so reserved from overflow) + 4 kg sugar.
    const small = await ops.workOrders.create({ bomId: ids.bom, productId: ids.cookie, warehouseId: MAIN_WAREHOUSE, quantity: "20" });
    await ops.workOrders.startProduction({ id: small.id });
    const flourLine = store.workOrderMaterials.find((m) => m.workOrderId === small.id && m.rawMaterialId === ids.flour)!;
    expect(flourLine).toMatchObject({ warehouseId: OVERFLOW_WAREHOUSE, reservedQuantity: qty(10), requiredQuantity: qty(10), status: "reserved" });
    expect((await ops.rawMaterialInventory.list({ rawMaterialId: ids.flour }))[1]).toMatchObject({ warehouseId: OVERFLOW_WAREHOUSE, quantity: qty(40), availableQuantity: qty(30) });

    // 4 kg of the flour was booked against the run by hand before completion.
    store.workOrderMaterials.update(flourLine.id, { consumedQuantity: qty(4) });
    await ops.workOrders.completeProduction({ id: small.id, completedQuantity: "20" });

    // Only the outstanding 6 kg leaves stock; the 4 kg reserved but not needed is available again.
    expect((await ops.rawMaterialInventory.list({ rawMaterialId: ids.flour }))[1]).toMatchObject({ warehouseId: OVERFLOW_WAREHOUSE, quantity: qty(34), availableQuantity: qty(34) });
    expect(store.workOrderMaterials.get(flourLine.id)).toMatchObject({ consumedQuantity: qty(10), reservedQuantity: qty(0), status: "consumed" });
    expect((await ops.rawMaterialInventory.list({ rawMaterialId: ids.sugar }))[0]).toMatchObject({ quantity: qty(2), availableQuantity: qty(2) });
  });

  it("step 7: a finance user cannot create a work order; ops-only procedures reject other roles too", async () => {
    const finance = appRouter.createCaller(ctxFor("finance"));
    await expect(
      finance.workOrders.create({ bomId: ids.bom, productId: ids.cookie, warehouseId: MAIN_WAREHOUSE, quantity: "5" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(finance.products.create({ name: "Nope" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const vendor = appRouter.createCaller(ctxFor("vendor"));
    await expect(
      vendor.workOrders.create({ bomId: ids.bom, productId: ids.cookie, quantity: "5" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Nothing was written by the rejected calls.
    expect(db.createWorkOrder).not.toHaveBeenCalled();
    expect(db.createProduct).not.toHaveBeenCalled();
  });

  it("guard: a work order needs a BOM or a BOM-backed recipe", async () => {
    await expect(
      ops.workOrders.create({ productId: ids.cookie, quantity: "5" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.createWorkOrder).not.toHaveBeenCalled();
  });
});
