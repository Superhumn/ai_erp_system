/**
 * fulfillOrder (server/db.ts) driven against the in-memory Drizzle engine from
 * server/flows/_fakeDrizzle — the real helper, no re-implemented SQL.
 *
 * The fake's `transaction` never rolls back and its `update` always reports one
 * affected row, so this file wraps `transaction` with a snapshot/restore (a
 * throw inside the callback restores every table, as a MySQL ROLLBACK would)
 * and, for the compare-and-set case, makes the orders update report zero
 * affected rows the way MySQL does when the WHERE no longer matches.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inventory, invoices, orderItems, orders, shipments } from "../drizzle/schema";

const { store, fakeDb } = await vi.hoisted(async () => (await import("./flows/_fakeDrizzle")).createFakeDrizzle());

vi.mock("mysql2", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));
process.env.DATABASE_URL = "mysql://test";

import { fulfillOrder } from "./db";

type Row = Record<string, any> & { id: number };
const TABLES = [orders, orderItems, inventory, shipments, invoices];
const rows = (tbl: object) => store.rows(tbl).all() as Row[];

// Transaction semantics the fake lacks: a throw inside the callback rolls every table back.
const runInTx = async (fn: (tx: any) => Promise<unknown>) => {
  const snapshot = TABLES.map((tbl) => [store.rows(tbl), store.rows(tbl).rows.map((r) => ({ ...r }))] as const);
  try {
    return await fn(fakeDb);
  } catch (err) {
    for (const [table, copy] of snapshot) table.rows.splice(0, table.rows.length, ...copy);
    throw err;
  }
};
fakeDb.transaction = runInTx;
const realInsert = fakeDb.insert;
const realUpdate = fakeDb.update;

const WH_A = 1;
const WH_B = 2;

function seedOrder(status: string, extra: Partial<Row> = {}) {
  return store.rows(orders).insert({ orderNumber: `ORD-${status}`, status, companyId: 1, customerId: 1, totalAmount: "100", shippingAddress: "1 Main St", ...extra });
}
function seedLine(orderId: number, productId: number | null, quantity: string) {
  return store.rows(orderItems).insert({ orderId, productId, quantity, unitPrice: "10", totalPrice: "10", companyId: 1 });
}
function seedStock(productId: number, warehouseId: number, quantity: string, reservedQuantity = "0") {
  return store.rows(inventory).insert({ productId, warehouseId, quantity, reservedQuantity, companyId: 1 });
}
const reservedOf = (id: number) => Number(store.rows(inventory).get(id)!.reservedQuantity);

beforeEach(() => {
  for (const tbl of TABLES) store.rows(tbl).clear();
  fakeDb.insert = realInsert;
  fakeDb.update = realUpdate;
  fakeDb.transaction = runInTx;
});

describe("fulfillOrder — status guard", () => {
  it.each(["pending", "processing", "shipped", "delivered", "cancelled", "refunded"])("refuses a %s order, naming the status, and writes nothing", async (status) => {
    const order = seedOrder(status);
    seedLine(order.id, 11, "2");
    const stock = seedStock(11, WH_A, "10");

    await expect(fulfillOrder(order.id)).rejects.toThrow(new RegExp(`ORD-${status} is ${status}; only a confirmed order`));

    expect(store.rows(orders).get(order.id)!.status).toBe(status);
    expect(reservedOf(stock.id)).toBe(0);
    expect(rows(shipments)).toHaveLength(0);
  });

  it("throws for a missing order", async () => {
    await expect(fulfillOrder(999)).rejects.toThrow("Order 999 not found");
  });

  it("throws for a confirmed order with no lines", async () => {
    const order = seedOrder("confirmed");
    await expect(fulfillOrder(order.id)).rejects.toThrow("has no line items");
    expect(store.rows(orders).get(order.id)!.status).toBe("confirmed");
  });
});

describe("fulfillOrder — per-product aggregation", () => {
  it("two lines of 6 for one product against 10 available fail before any write", async () => {
    const order = seedOrder("confirmed");
    seedLine(order.id, 11, "6");
    seedLine(order.id, 11, "6");
    const stock = seedStock(11, WH_A, "10");

    await expect(fulfillOrder(order.id)).rejects.toThrow(/insufficient stock \(product 11: need 12, have 10\)/);

    expect(reservedOf(stock.id)).toBe(0);
    expect(store.rows(orders).get(order.id)!.status).toBe("confirmed");
    expect(rows(shipments)).toHaveLength(0);
  });

  it("two lines of 6 for one product against 15 available reserve the sum on that row", async () => {
    const draft = store.rows(invoices).insert({ invoiceNumber: "INV-1", status: "draft", companyId: 1, customerId: 1, totalAmount: "100" });
    const order = seedOrder("confirmed", { invoiceId: draft.id });
    seedLine(order.id, 11, "6");
    seedLine(order.id, 11, "6");
    const stock = seedStock(11, WH_A, "15", "1");

    const result = await fulfillOrder(order.id, { performedBy: 7 });

    expect(reservedOf(stock.id)).toBe(13);
    expect(result).toMatchObject({
      orderId: order.id,
      orderNumber: "ORD-confirmed",
      status: "shipped",
      invoiceMarkedSent: true,
      performedBy: 7,
      allocations: [
        { inventoryId: stock.id, warehouseId: WH_A, productId: 11, quantity: 6 },
        { inventoryId: stock.id, warehouseId: WH_A, productId: 11, quantity: 6 },
      ],
    });
    expect(store.rows(orders).get(order.id)!.status).toBe("shipped");
    expect(store.rows(invoices).get(draft.id)!.status).toBe("sent");
    expect(rows(shipments)).toEqual([
      expect.objectContaining({ id: result.shipmentId, shipmentNumber: result.shipmentNumber, type: "outbound", orderId: order.id, status: "pending", toAddress: "1 Main St", companyId: 1 }),
    ]);
  });

  it("a later line sees the balance the earlier line planned and falls over to the next-best row", async () => {
    const order = seedOrder("confirmed");
    seedLine(order.id, 11, "6");
    seedLine(order.id, 11, "6");
    const a = seedStock(11, WH_A, "10");
    const b = seedStock(11, WH_B, "8");

    const result = await fulfillOrder(order.id);

    // Line 1 takes warehouse A (10 free); line 2 sees A at 4 and B at 8, so it takes B.
    expect(result.allocations).toEqual([
      { inventoryId: a.id, warehouseId: WH_A, productId: 11, quantity: 6 },
      { inventoryId: b.id, warehouseId: WH_B, productId: 11, quantity: 6 },
    ]);
    expect(reservedOf(a.id)).toBe(6);
    expect(reservedOf(b.id)).toBe(6);
  });

  it("a line without a product is reported as a shortage", async () => {
    const order = seedOrder("confirmed");
    seedLine(order.id, null, "1");
    await expect(fulfillOrder(order.id)).rejects.toThrow(/product \(no product\): need 1, have 0/);
  });
});

describe("fulfillOrder — atomicity", () => {
  it("rolls back the reservation and status change when the shipment insert throws", async () => {
    const order = seedOrder("confirmed");
    seedLine(order.id, 11, "4");
    const stock = seedStock(11, WH_A, "10");
    fakeDb.insert = (tbl: any) => {
      if (tbl === shipments) return { values: () => ({ $returningId: async () => { throw new Error("shipments insert failed"); } }) };
      return realInsert(tbl);
    };

    await expect(fulfillOrder(order.id)).rejects.toThrow("shipments insert failed");

    expect(reservedOf(stock.id)).toBe(0);
    expect(store.rows(orders).get(order.id)!.status).toBe("confirmed");
    expect(rows(shipments)).toHaveLength(0);
  });

  it("throws and reserves nothing when the compare-and-set on status matches zero rows", async () => {
    const order = seedOrder("confirmed");
    seedLine(order.id, 11, "4");
    const stock = seedStock(11, WH_A, "10");
    // A racing writer moved the order off `confirmed` between our read and the CAS:
    // MySQL matches no row and reports 0 affected rows.
    fakeDb.update = (tbl: any) => {
      if (tbl === orders) return { set: () => ({ where: async () => [{ affectedRows: 0 }] }) };
      return realUpdate(tbl);
    };

    await expect(fulfillOrder(order.id)).rejects.toThrow(/ORD-confirmed is no longer confirmed; fulfilment aborted/);

    expect(reservedOf(stock.id)).toBe(0);
    expect(rows(shipments)).toHaveLength(0);
  });

  it("runs the whole fulfilment inside db.transaction", async () => {
    const order = seedOrder("confirmed");
    seedLine(order.id, 11, "1");
    seedStock(11, WH_A, "1");
    const spy = vi.fn(runInTx);
    fakeDb.transaction = spy;

    await fulfillOrder(order.id);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
