/**
 * Flow test — the real server/db.ts stock-posting helpers that production and
 * PO receipt run through, driven against the in-memory Drizzle engine from
 * ./_fakeDrizzle (no live MySQL, no re-implemented helpers):
 *
 *  - createWorkOrderOutput books finished goods into the aggregate `inventory`
 *    row (not only lots / balances / ledger), so they reach inventory.list,
 *    transfers and scrap.
 *  - receivePurchaseOrderItems books product lines into `inventory` (raw
 *    material lines keep rawMaterialInventory) with a receive ledger row.
 *  - consumeWorkOrderMaterials draws each line from the warehouse its
 *    reservation was taken in and releases what it did not use.
 */
import { describe, expect, it, vi } from "vitest";
import {
  inventory, inventoryBalances, inventoryLots, inventoryTransactions, inventoryCostLayers, poReceivingItems, poReceivingRecords,
  products, purchaseOrderItems, purchaseOrders, rawMaterialInventory, rawMaterialTransactions, workOrderMaterials, workOrderOutputs, workOrders,
} from "../../drizzle/schema";

const { store, fakeDb } = await vi.hoisted(async () => (await import("./_fakeDrizzle")).createFakeDrizzle());

vi.mock("mysql2", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));
process.env.DATABASE_URL = "mysql://test";

import { addProductStock, consumeWorkOrderMaterials, createWorkOrderOutput, receivePurchaseOrderItems } from "../db";

const MAIN = 1;
const OVERFLOW = 2;
const rows = (tbl: object) => store.rows(tbl).all();

describe("createWorkOrderOutput (real db.ts helper)", () => {
  it("books the produced quantity into the aggregate inventory row for the warehouse, stamped with the entity", async () => {
    const cookie = store.rows(products).insert({ name: "Cookie Box", sku: "FG-COOKIE", companyId: 3, status: "active" });
    const wo = store.rows(workOrders).insert({ workOrderNumber: "WO-1", productId: cookie.id, bomId: 1, quantity: "100", warehouseId: MAIN, status: "in_progress", companyId: null });

    const first = await createWorkOrderOutput(wo.id, cookie.id, 95, MAIN, 95, 7);
    expect(first.lotCode).toMatch(/^LOT-/);

    // Traceability rows as before...
    expect(rows(inventoryLots)).toEqual([expect.objectContaining({ id: first.lotId, productId: cookie.id, productType: "finished", sourceType: "production", sourceReferenceId: wo.id })]);
    expect(rows(inventoryBalances)).toEqual([expect.objectContaining({ lotId: first.lotId, productId: cookie.id, warehouseId: MAIN, status: "available", quantity: "95" })]);
    expect(rows(inventoryTransactions)).toEqual([expect.objectContaining({ transactionType: "receive", lotId: first.lotId, productId: cookie.id, toWarehouseId: MAIN, quantity: "95", referenceType: "work_order", referenceId: wo.id, performedBy: 7 })]);
    expect(rows(workOrderOutputs)).toEqual([expect.objectContaining({ workOrderId: wo.id, lotId: first.lotId, productId: cookie.id, quantity: "95", warehouseId: MAIN, producedBy: 7 })]);
    // ...plus the aggregate row that inventory.list / transfers / scrap read (previously never written).
    expect(rows(inventory)).toEqual([expect.objectContaining({ productId: cookie.id, warehouseId: MAIN, quantity: "95", companyId: 3 })]);

    // A second run tops up the same row instead of creating a duplicate.
    await createWorkOrderOutput(wo.id, cookie.id, 5, MAIN, 100, 7);
    expect(rows(inventory)).toEqual([expect.objectContaining({ productId: cookie.id, warehouseId: MAIN, quantity: "100", companyId: 3 })]);
    expect(rows(inventoryLots)).toHaveLength(2);

    // Output into another warehouse gets its own row.
    await createWorkOrderOutput(wo.id, cookie.id, 10, OVERFLOW, 100, 7);
    expect(rows(inventory).map((r) => [r.warehouseId, r.quantity])).toEqual([[MAIN, "100"], [OVERFLOW, "10"]]);
  });

  it("addProductStock leaves an existing row's entity alone and only stamps a row it created", async () => {
    const widget = store.rows(products).insert({ name: "Widget", companyId: 9, status: "active" });
    store.rows(inventory).insert({ productId: widget.id, warehouseId: MAIN, quantity: "4", companyId: 1 });
    expect(await addProductStock(widget.id, MAIN, 6, 9)).toEqual({ created: false });
    expect(store.rows(inventory).find((r) => r.productId === widget.id)).toMatchObject({ quantity: "10", companyId: 1 });
    expect(await addProductStock(widget.id, OVERFLOW, 2, 9)).toEqual({ created: true });
    expect(store.rows(inventory).find((r) => r.productId === widget.id && r.warehouseId === OVERFLOW)).toMatchObject({ quantity: "2", companyId: 9 });
  });
});

describe("receivePurchaseOrderItems (real db.ts helper)", () => {
  it("books product lines into the inventory row of the receiving warehouse with a receive ledger row; raw-material-only lines do not", async () => {
    const paprika = store.rows(products).insert({ name: "Smoked Paprika", sku: "RM-PAP-01", companyId: 2, status: "active" });
    const po = store.rows(purchaseOrders).insert({ poNumber: "PO-9", vendorId: 1, status: "sent", companyId: 2, orderDate: new Date(), subtotal: "1250.00", totalAmount: "1250.00" });
    const productLine = store.rows(purchaseOrderItems).insert({ purchaseOrderId: po.id, productId: paprika.id, description: "Smoked Paprika", quantity: "100", unitPrice: "12.50", totalAmount: "1250.00", receivedQuantity: "0" });
    const serviceLine = store.rows(purchaseOrderItems).insert({ purchaseOrderId: po.id, productId: null, description: "Bulk salt", quantity: "20", unitPrice: "1.00", totalAmount: "20.00", receivedQuantity: "0" });
    const inventoryBefore = rows(inventory).length;

    const receipt = await receivePurchaseOrderItems(po.id, MAIN, [
      { purchaseOrderItemId: productLine.id, rawMaterialId: 41, productId: paprika.id, quantity: 60, unit: "kg", lotNumber: "LOT-A" },
      { purchaseOrderItemId: serviceLine.id, rawMaterialId: 42, quantity: 20, unit: "kg" },
    ], 5);

    expect(rows(poReceivingRecords)).toEqual([expect.objectContaining({ id: receipt.id, purchaseOrderId: po.id, warehouseId: MAIN, receivedBy: 5 })]);
    expect(rows(poReceivingItems).map((r) => [r.purchaseOrderItemId, r.rawMaterialId, r.productId ?? null, r.receivedQuantity])).toEqual([
      [productLine.id, 41, paprika.id, "60"],
      [serviceLine.id, 42, null, "20"],
    ]);
    // Raw-material stock moved for both lines, as before.
    expect(rows(rawMaterialInventory).map((r) => [r.rawMaterialId, r.warehouseId, r.quantity, r.availableQuantity])).toEqual([[41, MAIN, "60.0000", "60.0000"], [42, MAIN, "20.0000", "20.0000"]]);
    expect(rows(rawMaterialTransactions).map((t) => [t.rawMaterialId, t.transactionType, t.quantity])).toEqual([[41, "receive", "60.0000"], [42, "receive", "20.0000"]]);
    // The product line now also reaches the aggregate inventory row (it never did before); the service line has no product to book.
    const paprikaRows = rows(inventory).slice(inventoryBefore);
    expect(paprikaRows).toEqual([expect.objectContaining({ productId: paprika.id, warehouseId: MAIN, quantity: "60", companyId: 2 })]);
    expect(rows(inventoryTransactions).filter((t) => t.referenceType === "purchase_order")).toEqual([
      expect.objectContaining({ transactionType: "receive", productId: paprika.id, toWarehouseId: MAIN, quantity: "60", unit: "kg", referenceId: po.id, performedBy: 5, reason: "PO receipt (lot LOT-A)" }),
    ]);
    // Cost layer at PO price, received quantities and PO status as before.
    expect(rows(inventoryCostLayers)).toEqual([expect.objectContaining({ productId: paprika.id, warehouseId: MAIN, purchaseOrderId: po.id, unitCost: "12.5000", originalQuantity: "60" })]);
    expect(store.rows(purchaseOrderItems).get(productLine.id)!.receivedQuantity).toBe("60");
    expect(store.rows(purchaseOrders).get(po.id)!.status).toBe("partial");

    // Second delivery tops up the same inventory row and completes the PO.
    await receivePurchaseOrderItems(po.id, MAIN, [{ purchaseOrderItemId: productLine.id, rawMaterialId: 41, productId: paprika.id, quantity: 40, unit: "kg", lotNumber: "LOT-B" }], 5);
    expect(rows(inventory).filter((r) => r.productId === paprika.id)).toEqual([expect.objectContaining({ warehouseId: MAIN, quantity: "100", companyId: 2 })]);
    expect(store.rows(purchaseOrderItems).get(productLine.id)!.receivedQuantity).toBe("100");
    expect(store.rows(purchaseOrders).get(po.id)!.status).toBe("received");
    expect(rows(inventoryTransactions).filter((t) => t.referenceType === "purchase_order").map((t) => t.quantity)).toEqual(["60", "40"]);
  });
});

describe("consumeWorkOrderMaterials (real db.ts helper)", () => {
  it("consumes each line from the warehouse its reservation was taken in, releases unused reservations, and still falls back to the work order's warehouse", async () => {
    const wo = store.rows(workOrders).insert({ workOrderNumber: "WO-2", productId: 1, bomId: 1, quantity: "400", warehouseId: MAIN, status: "in_progress" });
    const flourMain = store.rows(workOrderMaterials).insert({ workOrderId: wo.id, rawMaterialId: 1, name: "Flour", unit: "kg", requiredQuantity: "140.0000", reservedQuantity: "140.0000", consumedQuantity: "0.0000", status: "reserved", warehouseId: MAIN });
    const sugar = store.rows(workOrderMaterials).insert({ workOrderId: wo.id, rawMaterialId: 2, name: "Sugar", unit: "kg", requiredQuantity: "5.0000", reservedQuantity: "5.0000", consumedQuantity: "2.0000", status: "reserved", warehouseId: MAIN });
    const flourOverflow = store.rows(workOrderMaterials).insert({ workOrderId: wo.id, rawMaterialId: 1, name: "Flour", unit: "kg", requiredQuantity: "60.0000", reservedQuantity: "60.0000", consumedQuantity: "0.0000", status: "reserved", warehouseId: OVERFLOW });
    const legacy = store.rows(workOrderMaterials).insert({ workOrderId: wo.id, rawMaterialId: 3, name: "Salt", unit: "kg", requiredQuantity: "4.0000", reservedQuantity: "0.0000", consumedQuantity: "0.0000", status: "pending", warehouseId: null });
    const missing = store.rows(workOrderMaterials).insert({ workOrderId: wo.id, rawMaterialId: 4, name: "Vanilla", unit: "kg", requiredQuantity: "1.0000", reservedQuantity: "1.0000", consumedQuantity: "0.0000", status: "reserved", warehouseId: OVERFLOW });
    store.rows(rawMaterialInventory).clear();
    const inv = (rawMaterialId: number, warehouseId: number, quantity: string, availableQuantity: string) =>
      store.rows(rawMaterialInventory).insert({ rawMaterialId, warehouseId, quantity, availableQuantity, reservedQuantity: "0.0000", unit: "kg" });
    inv(1, MAIN, "140.0000", "0.0000");      // fully reserved by this run
    inv(1, OVERFLOW, "100.0000", "40.0000"); // 60 reserved by this run
    inv(2, MAIN, "10.0000", "5.0000");       // 5 reserved, only 3 still needed
    inv(3, MAIN, "10.0000", "10.0000");      // never reserved
    const txnsBefore = rows(rawMaterialTransactions).length;

    await consumeWorkOrderMaterials(wo.id, 7);

    expect(rows(rawMaterialInventory).map((r) => [r.rawMaterialId, r.warehouseId, r.quantity, r.availableQuantity])).toEqual([
      [1, MAIN, "0.0000", "0.0000"],
      [1, OVERFLOW, "40.0000", "40.0000"], // the 60 reserved here is consumed here — the old code drew only from MAIN and never released this
      [2, MAIN, "7.0000", "7.0000"],       // 3 consumed; the 2 reserved-but-unused released back to available
      [3, MAIN, "6.0000", "6.0000"],       // unreserved line: work order's warehouse, as before
    ]);
    expect(rows(rawMaterialTransactions).slice(txnsBefore).map((t) => [t.rawMaterialId, t.warehouseId, t.transactionType, t.quantity, t.previousQuantity, t.newQuantity, t.referenceId, t.performedBy])).toEqual([
      [1, MAIN, "consume", "-140.0000", "140.0000", "0.0000", wo.id, 7],
      [2, MAIN, "consume", "-3.0000", "10.0000", "7.0000", wo.id, 7],
      [1, OVERFLOW, "consume", "-60.0000", "100.0000", "40.0000", wo.id, 7],
      [3, MAIN, "consume", "-4.0000", "10.0000", "6.0000", wo.id, 7],
    ]);
    const line = (id: number) => store.rows(workOrderMaterials).get(id)!;
    expect(line(flourMain.id)).toMatchObject({ consumedQuantity: "140.0000", reservedQuantity: "0.0000", status: "consumed" });
    expect(line(flourOverflow.id)).toMatchObject({ consumedQuantity: "60.0000", reservedQuantity: "0.0000", status: "consumed" });
    expect(line(sugar.id)).toMatchObject({ consumedQuantity: "5.0000", reservedQuantity: "0.0000", status: "consumed" });
    expect(line(legacy.id)).toMatchObject({ consumedQuantity: "4.0000", reservedQuantity: "0.0000", status: "consumed" });
    expect(line(missing.id)).toMatchObject({ status: "shortage", consumedQuantity: "0.0000" });
    expect(store.rows(workOrders).get(wo.id)).toMatchObject({ status: "completed" });
    expect(store.rows(workOrders).get(wo.id)!.actualEndDate).toBeInstanceOf(Date);
  });

  it("marks a line partial when the stock on hand cannot cover the outstanding quantity", async () => {
    const wo = store.rows(workOrders).insert({ workOrderNumber: "WO-3", productId: 1, bomId: 1, quantity: "10", warehouseId: MAIN, status: "in_progress" });
    const line = store.rows(workOrderMaterials).insert({ workOrderId: wo.id, rawMaterialId: 8, name: "Cocoa", unit: "kg", requiredQuantity: "5.0000", reservedQuantity: "5.0000", consumedQuantity: "0.0000", status: "reserved", warehouseId: OVERFLOW });
    store.rows(rawMaterialInventory).insert({ rawMaterialId: 8, warehouseId: OVERFLOW, quantity: "2.0000", availableQuantity: "0.0000", reservedQuantity: "0.0000", unit: "kg" });

    await consumeWorkOrderMaterials(wo.id, 7);

    expect(store.rows(rawMaterialInventory).find((r) => r.rawMaterialId === 8)).toMatchObject({ quantity: "0.0000", availableQuantity: "0.0000" });
    expect(store.rows(workOrderMaterials).get(line.id)).toMatchObject({ consumedQuantity: "2.0000", reservedQuantity: "0.0000", status: "partial" });
  });
});
