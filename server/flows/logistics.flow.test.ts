/**
 * Logistics process flow: warehouses + carriers → freight RFQ → quotes →
 * award → shipment lifecycle → inter-warehouse transfer → customs clearance.
 *
 * Every step runs through the live appRouter. The db module is an in-memory
 * store whose helpers mirror the contract of the real ones in server/db.ts;
 * email and LLM are stubbed so outbound side effects can be asserted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ctxFor, qty } from "./_harness";

type Row = { id: number; [key: string]: unknown };

vi.mock("../_core/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_core/email")>()),
  isEmailConfigured: () => true,
  sendEmail: vi.fn(async () => ({ success: true, messageId: "msg-1" })),
  formatEmailHtml: (text: string) => `<p>${text}</p>`,
}));

vi.mock("../_core/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_core/llm")>()),
  invokeLLM: vi.fn(async () => ({ choices: [{ message: { content: "Dear carrier, please quote the attached lane." } }] })),
}));

vi.mock("../db", async () => {
  const { table } = await import("./_harness");
  const { vi } = await import("vitest");

  const warehouses = table<Row>();
  const freightCarriers = table<Row>();
  const freightRfqs = table<Row>();
  const freightQuotes = table<Row>();
  const freightEmails = table<Row>();
  const freightBookings = table<Row>();
  const shipments = table<Row>();
  const orders = table<Row>([{ orderNumber: "SO-1001", status: "processing", customerId: 3 }]);
  const rawMaterials = table<Row>([
    { name: "Cocoa", unit: "kg", quantityOnOrder: "0.0000", quantityInTransit: "0.0000", quantityReceived: "0.0000", receivingStatus: "none" },
  ]);
  const inventory = table<Row>();
  const inventoryTransactions = table<Row>();
  const inventoryTransfers = table<Row>();
  const inventoryTransferItems = table<Row>();
  // PO 7: one product line, one service line with no product, one more product line.
  const purchaseOrderItems = table<Row>([
    { purchaseOrderId: 7, productId: 10, description: "Cookie Box", quantity: qty(40), receivedQuantity: qty(0) },
    { purchaseOrderId: 7, productId: null, description: "Inbound freight fee", quantity: qty(1), receivedQuantity: qty(0) },
    { purchaseOrderId: 7, productId: 11, description: "Gift Tin", quantity: qty(12), receivedQuantity: qty(0) },
  ]);
  const customsClearances = table<Row>();
  const auditLogs = table<Row>();

  const num = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
  const snap = (r: Row | undefined | null) => (r ? { ...r } : r);
  const snapAll = (rows: Row[]) => rows.map((r) => ({ ...r }));
  const year = new Date().getFullYear();

  // ---- warehouses ----
  const createWarehouse = vi.fn(async (data: Row) => ({ id: warehouses.insert({ status: "active", ...data }).id }));
  const getWarehouseById = vi.fn(async (id: number) => snap(warehouses.get(id)) ?? null);
  const getWarehouses = vi.fn(async () => snapAll(warehouses.all()));

  // ---- freight ----
  const createFreightCarrier = vi.fn(async (data: Row) => ({ id: freightCarriers.insert({ contactSource: "manual", isActive: true, ...data }).id }));
  const getFreightCarrierById = vi.fn(async (id: number) => snap(freightCarriers.get(id)));
  const getFreightRfqById = vi.fn(async (id: number) => snap(freightRfqs.get(id)));
  const createFreightRfq = vi.fn(async (data: Row) => {
    const rfqNumber = `RFQ-${year}-${String(freightRfqs.all().length + 1).padStart(5, "0")}`;
    return { id: freightRfqs.insert({ status: "draft", ...data, rfqNumber }).id, rfqNumber };
  });
  const updateFreightRfq = vi.fn(async (id: number, data: Row) => { freightRfqs.update(id, data); return { success: true }; });
  const createFreightEmail = vi.fn(async (data: Row) => ({ id: freightEmails.insert(data).id }));
  const getFreightQuotes = vi.fn(async (rfqId?: number) =>
    snapAll(freightQuotes.filter((q) => !rfqId || q.rfqId === rfqId)).sort((a, b) => num(a.totalCost) - num(b.totalCost)));
  const getFreightQuoteById = vi.fn(async (id: number) => snap(freightQuotes.get(id)));
  const createFreightQuote = vi.fn(async (data: Row) => ({ id: freightQuotes.insert({ status: "pending", ...data }).id }));
  const updateFreightQuote = vi.fn(async (id: number, data: Row) => { freightQuotes.update(id, data); return { success: true }; });
  const createFreightBooking = vi.fn(async (data: Row) => {
    const bookingNumber = `BK-${year}-${String(freightBookings.all().length + 1).padStart(5, "0")}`;
    return { id: freightBookings.insert({ ...data, bookingNumber }).id, bookingNumber };
  });

  // ---- shipments + linked order / raw material ----
  const createShipment = vi.fn(async (data: Row) => ({ id: shipments.insert({ status: "pending", ...data }).id }));
  const getShipmentById = vi.fn(async (id: number) => snap(shipments.get(id)));
  const updateShipment = vi.fn(async (id: number, data: Row) => { shipments.update(id, data); });
  const getOrderById = vi.fn(async (id: number) => snap(orders.get(id)));
  const updateOrder = vi.fn(async (id: number, data: Row) => { orders.update(id, data); });
  // Mirrors db.adjustRawMaterialInventory: GREATEST(0, COALESCE(col, 0) + delta) per counter, plus the extra columns.
  const adjustRawMaterialInventory = vi.fn(
    async (id: number, deltas: { onOrder?: number; inTransit?: number; received?: number }, extra?: Row) => {
      const row = rawMaterials.get(id);
      if (!row) return;
      const patch: Row = { id, ...extra };
      if (deltas.onOrder !== undefined) patch.quantityOnOrder = qty(Math.max(0, num(row.quantityOnOrder) + deltas.onOrder));
      if (deltas.inTransit !== undefined) patch.quantityInTransit = qty(Math.max(0, num(row.quantityInTransit) + deltas.inTransit));
      if (deltas.received !== undefined) patch.quantityReceived = qty(Math.max(0, num(row.quantityReceived) + deltas.received));
      rawMaterials.update(id, patch);
    },
  );

  // ---- aggregate inventory (products × warehouses) ----
  const getInventory = vi.fn(async (_scope: unknown, filters?: { productId?: number; warehouseId?: number }) =>
    snapAll(inventory.filter(
      (r) => (!filters?.productId || r.productId === filters.productId) && (!filters?.warehouseId || r.warehouseId === filters.warehouseId),
    )));
  const createInventory = vi.fn(async (data: Row) => ({ id: inventory.insert(data).id }));
  const updateInventory = vi.fn(async (id: number, data: Row) => { inventory.update(id, data); });
  const createInventoryTransaction = vi.fn(async (data: Row) => {
    const transactionNumber = `TXN-${inventoryTransactions.all().length + 1}`;
    return { id: inventoryTransactions.insert({ ...data, transactionNumber }).id, transactionNumber };
  });
  // Mirrors db.updateInventoryQuantity: add to the first matching row or insert one.
  const updateInventoryQuantity = vi.fn(async (productId: number, warehouseId: number, quantityChange: number) => {
    const existing = inventory.find((r) => r.productId === productId && r.warehouseId === warehouseId);
    if (existing) inventory.update(existing.id, { quantity: (num(existing.quantity) + quantityChange).toString() });
    else inventory.insert({ productId, warehouseId, quantity: quantityChange.toString() });
    return { success: true };
  });

  // ---- transfers ----
  const getTransferById = vi.fn(async (id: number) => snap(inventoryTransfers.get(id)) ?? null);
  const getTransferItems = vi.fn(async (transferId: number) => snapAll(inventoryTransferItems.filter((i) => i.transferId === transferId)));
  const createTransfer = vi.fn(async (data: Row) => {
    const transferNumber = `TRF-${Date.now().toString(36).toUpperCase()}`;
    return { id: inventoryTransfers.insert({ status: "draft", ...data, transferNumber }).id, transferNumber };
  });
  const addTransferItem = vi.fn(async (data: Row) => ({ id: inventoryTransferItems.insert(data).id }));
  const updateTransfer = vi.fn(async (id: number, data: Row) => { inventoryTransfers.update(id, data); return { success: true }; });
  const updateTransferItem = vi.fn(async (id: number, data: Row) => { inventoryTransferItems.update(id, data); return { success: true }; });
  const processTransferShipment = vi.fn(async (transferId: number) => {
    const transfer = await getTransferById(transferId);
    if (!transfer) throw new Error("Transfer not found");
    const items = await getTransferItems(transferId);
    for (const item of items) {
      await updateInventoryQuantity(item.productId as number, transfer.fromWarehouseId as number, -(num(item.requestedQuantity)));
    }
    await updateTransfer(transferId, { status: "in_transit", shippedDate: new Date() });
    for (const item of items) await updateTransferItem(item.id, { shippedQuantity: item.requestedQuantity });
    return { success: true };
  });
  const processTransferReceipt = vi.fn(async (transferId: number, receivedItems: { itemId: number; receivedQuantity: number }[]) => {
    const transfer = await getTransferById(transferId);
    if (!transfer) throw new Error("Transfer not found");
    for (const received of receivedItems) {
      const item = inventoryTransferItems.get(received.itemId);
      if (item) {
        await updateInventoryQuantity(item.productId as number, transfer.toWarehouseId as number, received.receivedQuantity);
        await updateTransferItem(received.itemId, { receivedQuantity: received.receivedQuantity.toString() });
      }
    }
    await updateTransfer(transferId, { status: "received", receivedDate: new Date() });
    return { success: true };
  });

  // ---- customs + PO receiving ----
  const getCustomsClearanceById = vi.fn(async (id: number) => snap(customsClearances.get(id)));
  const createCustomsClearance = vi.fn(async (data: Row) => {
    const clearanceNumber = `CC-${year}-${String(customsClearances.all().length + 1).padStart(5, "0")}`;
    return { id: customsClearances.insert({ status: "pending_documents", ...data, clearanceNumber }).id, clearanceNumber };
  });
  const updateCustomsClearance = vi.fn(async (id: number, data: Row) => { customsClearances.update(id, data); return { success: true }; });
  const getPurchaseOrderItems = vi.fn(async (purchaseOrderId: number) =>
    snapAll(purchaseOrderItems.filter((i) => i.purchaseOrderId === purchaseOrderId)).map((i) => ({ ...i, rawMaterial: null })));
  const updatePurchaseOrderItem = vi.fn(async (id: number, data: Row) => { purchaseOrderItems.update(id, data); return { success: true }; });

  // ---- side effects ----
  const createAuditLog = vi.fn(async (data: Row) => { auditLogs.insert(data); });
  const getUsersByRoles = vi.fn(async (roles: string[]) => (roles.includes("sales") ? [{ id: 1 }, { id: 7 }, { id: 9 }] : [{ id: 1 }, { id: 7 }]));
  const notifyUsersOfEvent = vi.fn(async () => ({ inApp: 2, email: 0 }));

  return {
    getDb: vi.fn().mockResolvedValue({}),
    __store: {
      warehouses, freightCarriers, freightRfqs, freightQuotes, freightEmails, freightBookings, shipments, orders, rawMaterials,
      inventory, inventoryTransactions, inventoryTransfers, inventoryTransferItems, purchaseOrderItems, customsClearances, auditLogs,
    },
    createWarehouse, getWarehouseById, getWarehouses,
    createFreightCarrier, getFreightCarrierById, getFreightRfqById, createFreightRfq, updateFreightRfq, createFreightEmail,
    getFreightQuotes, getFreightQuoteById, createFreightQuote, updateFreightQuote, createFreightBooking,
    createShipment, getShipmentById, updateShipment, getOrderById, updateOrder, adjustRawMaterialInventory,
    getInventory, createInventory, updateInventory, createInventoryTransaction, updateInventoryQuantity,
    getTransferById, getTransferItems, createTransfer, addTransferItem, updateTransfer, updateTransferItem,
    processTransferShipment, processTransferReceipt,
    getCustomsClearanceById, createCustomsClearance, updateCustomsClearance, getPurchaseOrderItems, updatePurchaseOrderItem,
    createAuditLog, getUsersByRoles, notifyUsersOfEvent,
  };
});

import * as db from "../db";
import * as email from "../_core/email";
import * as llm from "../_core/llm";
import { appRouter } from "../routers";

type Store = Record<string, ReturnType<typeof import("./_harness").table<Row>>>;
const store = (db as unknown as { __store: Store }).__store;

const ops = appRouter.createCaller(ctxFor("ops"));
const YEAR = new Date().getFullYear();
const SALES_ORDER_ID = 1;
const PURCHASE_ORDER_ID = 7;
const COCOA_ID = 1;
const PRODUCT_COOKIE = 10;
const PRODUCT_TIN = 11;

const ids = {
  mainDc: 0, westHub: 0,
  oceanCarrier: 0, groundCarrier: 0, discoveredCarrier: 0,
  rfq: 0, oceanQuote: 0, groundQuote: 0,
  outboundShipment: 0, inboundShipment: 0, poShipment: 0,
  transfer: 0, transferItem: 0, clearance: 0,
};
let rfqNumber = "";
let outboundShipmentNumber = "";

describe("logistics flow: warehouses → RFQ → quotes → shipment → transfer → customs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("step 1: ops creates two warehouses and a carrier", async () => {
    ids.mainDc = (await ops.warehouses.create({ name: "Main DC", code: "DC1", type: "distribution", city: "Los Angeles", country: "US" })).id;
    ids.westHub = (await ops.warehouses.create({ name: "West Hub", code: "WH2", type: "warehouse", city: "Oakland", country: "US" })).id;
    expect([ids.mainDc, ids.westHub]).toEqual([1, 2]);
    expect(await ops.warehouses.getById({ id: ids.mainDc })).toMatchObject({ name: "Main DC", code: "DC1", type: "distribution", status: "active" });
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "create", entityType: "warehouse", entityId: ids.mainDc, entityName: "Main DC", userId: 1 }));

    // Only the known location types are accepted.
    await expect(ops.warehouses.create({ name: "Bad", type: "hangar" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    ids.oceanCarrier = (await ops.freight.carriers.create({ name: "Maersk Line", type: "ocean", email: "quotes@maersk.example", country: "DK" })).id;
    ids.groundCarrier = (await ops.freight.carriers.create({ name: "Local Trucking Co", type: "ground" })).id; // no email on file
    expect(await ops.freight.carriers.get({ id: ids.oceanCarrier })).toMatchObject({ name: "Maersk Line", type: "ocean", email: "quotes@maersk.example", contactSource: "manual", isActive: true });
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "create", entityType: "freight_carrier", entityId: ids.oceanCarrier, entityName: "Maersk Line" }));

    // A model-suggested carrier whose contact details were never verified.
    ids.discoveredCarrier = store.freightCarriers.insert({ name: "Suggested Freight", type: "ocean", email: "guess@example.com", contactSource: "discovered", isActive: true }).id;
  });

  it("step 2: a freight RFQ for the lane is emailed to the carriers that can receive it", async () => {
    const created = await ops.freight.rfqs.create({
      title: "Shanghai → Los Angeles, 1x40HC", originCountry: "CN", originCity: "Shanghai", destinationCountry: "US", destinationCity: "Los Angeles",
      cargoDescription: "Packaged cookies", cargoType: "general", totalWeight: "12000", totalVolume: "60", numberOfPackages: 800,
      preferredMode: "ocean_fcl", incoterms: "FOB", purchaseOrderId: PURCHASE_ORDER_ID, quoteDueDate: new Date("2026-10-15"),
    });
    ids.rfq = created.id;
    rfqNumber = created.rfqNumber;
    expect(rfqNumber).toBe(`RFQ-${YEAR}-00001`);
    expect(await ops.freight.rfqs.get({ id: ids.rfq })).toMatchObject({ status: "draft", originCity: "Shanghai", destinationCity: "Los Angeles", createdById: 1 });

    const result = await ops.freight.rfqs.sendToCarriers({ rfqId: ids.rfq, carrierIds: [ids.oceanCarrier, ids.groundCarrier, ids.discoveredCarrier] });
    expect(result).toMatchObject({ sent: 1, failed: 1, blocked: 1, emailConfigured: true });
    expect(result.emails).toEqual([
      expect.objectContaining({ carrierId: ids.oceanCarrier, carrierName: "Maersk Line", status: "sent", emailId: 1 }),
      expect.objectContaining({ carrierId: ids.groundCarrier, status: "failed", error: "No email address on this carrier" }),
      expect.objectContaining({ carrierId: ids.discoveredCarrier, status: "blocked", error: expect.stringContaining("unverified") }),
    ]);

    // Exactly one email went out, to the verified carrier, quoting the RFQ number.
    expect(llm.invokeLLM).toHaveBeenCalledTimes(1);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "quotes@maersk.example",
      subject: `Request for Quote: ${rfqNumber} - Shanghai → Los Angeles, 1x40HC`,
      text: "Dear carrier, please quote the attached lane.",
    }));
    expect(store.freightEmails.all()).toEqual([
      expect.objectContaining({ rfqId: ids.rfq, carrierId: ids.oceanCarrier, direction: "outbound", emailType: "rfq_request", toEmail: "quotes@maersk.example", status: "sent", aiGenerated: true }),
    ]);

    expect((await ops.freight.rfqs.get({ id: ids.rfq }))!.status).toBe("sent");
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "update", entityType: "freight_rfq", entityId: ids.rfq, entityName: "Emails sent to 1 carriers; 1 blocked as unverified",
    }));
  });

  it("step 3: carrier quotes arrive and the best one is awarded, which books it and rejects the rest", async () => {
    ids.oceanQuote = (await ops.freight.quotes.create({
      rfqId: ids.rfq, carrierId: ids.oceanCarrier, quoteNumber: "MAEU-Q-1", freightCost: "2500", fuelSurcharge: "400", destinationCharges: "200",
      totalCost: "3100", currency: "USD", transitDays: 28, shippingMode: "ocean_fcl", receivedVia: "email",
    })).id;
    expect(await ops.freight.quotes.get({ id: ids.oceanQuote })).toMatchObject({ status: "received", totalCost: "3100", transitDays: 28 });
    expect((await ops.freight.rfqs.get({ id: ids.rfq }))!.status).toBe("quotes_received");

    ids.groundQuote = (await ops.freight.quotes.create({ rfqId: ids.rfq, carrierId: ids.groundCarrier, totalCost: "3400", currency: "USD", transitDays: 35 })).id;
    // Comparison view is sorted by total cost.
    expect((await ops.freight.quotes.list({ rfqId: ids.rfq })).map((q) => [q.id, q.totalCost])).toEqual([[ids.oceanQuote, "3100"], [ids.groundQuote, "3400"]]);

    vi.clearAllMocks();
    const { booking } = await ops.freight.quotes.accept({ quoteId: ids.oceanQuote });
    expect(booking).toEqual({ id: 1, bookingNumber: `BK-${YEAR}-00001` });
    expect(store.freightBookings.get(1)).toMatchObject({ quoteId: ids.oceanQuote, rfqId: ids.rfq, carrierId: ids.oceanCarrier, status: "pending", agreedCost: "3100", currency: "USD" });

    expect((await ops.freight.quotes.get({ id: ids.oceanQuote }))!.status).toBe("accepted");
    expect((await ops.freight.quotes.get({ id: ids.groundQuote }))!.status).toBe("rejected");
    expect((await ops.freight.rfqs.get({ id: ids.rfq }))!.status).toBe("awarded");
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "approve", entityType: "freight_quote", entityId: ids.oceanQuote, entityName: `Booking BK-${YEAR}-00001 created`,
    }));
  });

  it("step 4: an outbound shipment for a sales order moves pending → in_transit → delivered and closes the order", async () => {
    const created = await ops.shipments.create({
      type: "outbound", orderId: SALES_ORDER_ID, carrier: "Maersk Line", trackingNumber: "MAEU1234567", quantity: "40",
      fromAddress: "Main DC, Los Angeles", toAddress: "Customer, Denver", shipDate: new Date("2026-10-02"),
    });
    ids.outboundShipment = created.id;
    const shipment = store.shipments.get(ids.outboundShipment)!;
    outboundShipmentNumber = shipment.shipmentNumber as string;
    expect(outboundShipmentNumber).toMatch(/^SHIP-\d{4}-\d{4}$/);
    expect(shipment).toMatchObject({ type: "outbound", orderId: SALES_ORDER_ID, status: "pending", trackingNumber: "MAEU1234567" });
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "create", entityType: "shipment", entityId: ids.outboundShipment, entityName: outboundShipmentNumber }));
    // An outbound shipment never touches raw-material counters.
    expect(db.adjustRawMaterialInventory).not.toHaveBeenCalled();

    // 'picked_up' is not a shipment status the system knows.
    await expect(ops.shipments.update({ id: ids.outboundShipment, status: "picked_up" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(store.shipments.get(ids.outboundShipment)!.status).toBe("pending");

    vi.clearAllMocks();
    await ops.shipments.update({ id: ids.outboundShipment, status: "in_transit", trackingNumber: "MAEU1234567" });
    expect(store.shipments.get(ids.outboundShipment)!.status).toBe("in_transit");
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "update", entityType: "shipment", entityId: ids.outboundShipment }));
    expect(db.notifyUsersOfEvent).toHaveBeenCalledTimes(1);
    expect(db.notifyUsersOfEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "shipping_update", title: `Shipment ${outboundShipmentNumber} in_transit`,
        message: `Shipment ${outboundShipmentNumber} status changed to in_transit (Tracking: MAEU1234567)`,
        entityType: "shipment", entityId: ids.outboundShipment, severity: "info", metadata: { trackingNumber: "MAEU1234567" },
      }),
      [1, 7],
    );
    expect(store.orders.get(SALES_ORDER_ID)!.status).toBe("processing");

    vi.clearAllMocks();
    await ops.shipments.update({ id: ids.outboundShipment, status: "delivered", deliveryDate: new Date("2026-10-30") });
    expect(store.shipments.get(ids.outboundShipment)).toMatchObject({ status: "delivered", deliveryDate: new Date("2026-10-30") });
    // Cascade: the linked sales order is delivered and sales is told.
    expect(db.updateOrder).toHaveBeenCalledWith(SALES_ORDER_ID, { status: "delivered" });
    expect(store.orders.get(SALES_ORDER_ID)!.status).toBe("delivered");
    expect(db.notifyUsersOfEvent).toHaveBeenCalledTimes(2);
    expect(db.notifyUsersOfEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: "shipping_update", title: `Shipment ${outboundShipmentNumber} delivered` }), [1, 7]);
    expect(db.notifyUsersOfEvent).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ type: "sales_order_delivered", title: "Order SO-1001 delivered", entityType: "order", entityId: SALES_ORDER_ID, metadata: { shipmentId: ids.outboundShipment } }),
      [1, 7, 9],
    );

    // Marking delivered again is a no-op for the order and sends no duplicate notification.
    vi.clearAllMocks();
    await ops.shipments.update({ id: ids.outboundShipment, status: "delivered" });
    expect(db.updateOrder).not.toHaveBeenCalled();
    expect(db.notifyUsersOfEvent).not.toHaveBeenCalled();

    // Audit trail: create + 3 accepted updates (the rejected 'picked_up' never reached the log).
    expect(store.auditLogs.filter((a) => a.entityType === "shipment" && a.entityId === ids.outboundShipment)).toHaveLength(4);
  });

  it("step 4b: an inbound raw-material shipment tracks the quantity as in-transit until delivered", async () => {
    ids.inboundShipment = (await ops.shipments.create({ type: "inbound", rawMaterialId: COCOA_ID, quantity: "25", carrier: "DHL", shipDate: new Date("2026-10-05") })).id;
    expect(db.adjustRawMaterialInventory).toHaveBeenCalledWith(COCOA_ID, { inTransit: 25 }, { receivingStatus: "in_transit", expectedDeliveryDate: new Date("2026-10-05") });
    expect(store.rawMaterials.get(COCOA_ID)).toMatchObject({ quantityInTransit: qty(25), quantityReceived: qty(0), receivingStatus: "in_transit" });

    await ops.shipments.update({ id: ids.inboundShipment, status: "delivered" });
    expect(db.adjustRawMaterialInventory).toHaveBeenLastCalledWith(COCOA_ID, { inTransit: -25, received: 25 }, expect.objectContaining({ receivingStatus: "received", lastReceivedQty: "25" }));
    expect(store.rawMaterials.get(COCOA_ID)).toMatchObject({ quantityInTransit: qty(0), quantityReceived: qty(25), receivingStatus: "received" });
  });

  it("step 5: an inventory transfer moves stock from one warehouse to the other", async () => {
    store.inventory.insert({ productId: PRODUCT_COOKIE, warehouseId: ids.mainDc, quantity: "100" });
    const requestedDate = new Date("2026-10-01T09:00:00Z");

    const created = await ops.transfers.create({ fromWarehouseId: ids.mainDc, toWarehouseId: ids.westHub, requestedDate, expectedArrival: new Date("2026-10-03"), notes: "Restock west" });
    ids.transfer = created.id;
    expect(created.transferNumber).toMatch(/^TRF-[0-9A-Z]+$/);
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "create", entityType: "transfer", entityId: ids.transfer, entityName: created.transferNumber }));

    ids.transferItem = (await ops.transfers.addItem({ transferId: ids.transfer, productId: PRODUCT_COOKIE, requestedQuantity: "30" })).id;
    let detail = await ops.transfers.getById({ id: ids.transfer });
    expect(detail.transfer).toMatchObject({ status: "draft", fromWarehouseId: ids.mainDc, toWarehouseId: ids.westHub, requestedDate, requestedBy: 1, notes: "Restock west" });
    expect(detail.items).toEqual([expect.objectContaining({ productId: PRODUCT_COOKIE, requestedQuantity: "30" })]);

    vi.clearAllMocks();
    await ops.transfers.ship({ id: ids.transfer, trackingNumber: "1Z999", carrier: "UPS" });
    detail = await ops.transfers.getById({ id: ids.transfer });
    expect(detail.transfer).toMatchObject({ status: "in_transit", trackingNumber: "1Z999", carrier: "UPS" });
    expect(detail.transfer!.shippedDate).toBeInstanceOf(Date);
    expect(detail.items[0]).toMatchObject({ shippedQuantity: "30" });
    expect(detail.items[0]).not.toHaveProperty("receivedQuantity");
    // Source decremented, destination not yet touched.
    expect(db.updateInventoryQuantity).toHaveBeenCalledWith(PRODUCT_COOKIE, ids.mainDc, -30);
    expect(store.inventory.filter((r) => r.productId === PRODUCT_COOKIE).map((r) => [r.warehouseId, r.quantity])).toEqual([[ids.mainDc, "70"]]);
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "update", entityType: "transfer", entityId: ids.transfer, entityName: "Shipped transfer" }));

    vi.clearAllMocks();
    await ops.transfers.receive({ id: ids.transfer, items: [{ itemId: ids.transferItem, receivedQuantity: 30 }] });
    detail = await ops.transfers.getById({ id: ids.transfer });
    expect(detail.transfer!.status).toBe("received");
    expect(detail.transfer!.receivedDate).toBeInstanceOf(Date);
    expect(detail.items[0]).toMatchObject({ shippedQuantity: "30", receivedQuantity: "30" });
    expect(db.updateInventoryQuantity).toHaveBeenCalledWith(PRODUCT_COOKIE, ids.westHub, 30);
    expect(store.inventory.filter((r) => r.productId === PRODUCT_COOKIE).map((r) => [r.warehouseId, r.quantity])).toEqual([
      [ids.mainDc, "70"],
      [ids.westHub, "30"],
    ]);
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "transfer", entityId: ids.transfer, entityName: "Received transfer" }));
  });

  it("step 6: clearing customs receives the PO's product lines into the warehouse and skips lines without a product", async () => {
    ids.poShipment = (await ops.shipments.create({ type: "inbound", purchaseOrderId: PURCHASE_ORDER_ID, carrier: "Maersk Line", trackingNumber: "MAEU7654321" })).id;

    const created = await ops.customs.clearances.create({
      shipmentId: ids.poShipment, type: "import", portOfEntry: "Port of Los Angeles", country: "US", hsCode: "1905.31", countryOfOrigin: "CN",
    });
    ids.clearance = created.id;
    expect(created.clearanceNumber).toBe(`CC-${YEAR}-00001`);
    expect(await ops.customs.clearances.get({ id: ids.clearance })).toMatchObject({ status: "pending_documents", shipmentId: ids.poShipment, type: "import", hsCode: "1905.31" });

    await ops.customs.clearances.update({ id: ids.clearance, status: "documents_submitted", submissionDate: new Date("2026-10-20") });
    expect((await ops.customs.clearances.get({ id: ids.clearance }))!.status).toBe("documents_submitted");

    // Clearing needs to know where the goods land.
    await expect(ops.customs.clearances.update({ id: ids.clearance, status: "cleared" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await ops.customs.clearances.get({ id: ids.clearance }))!.status).toBe("documents_submitted");

    vi.clearAllMocks();
    await ops.customs.clearances.update({ id: ids.clearance, status: "cleared", warehouseId: ids.mainDc, dutyAmount: "120.00", taxAmount: "48.00", totalAmount: "168.00", actualClearanceDate: new Date("2026-10-28") });
    expect(await ops.customs.clearances.get({ id: ids.clearance })).toMatchObject({ status: "cleared", dutyAmount: "120.00", totalAmount: "168.00" });

    // Cookie Box (existing row: 70 + 40) and Gift Tin (new row: 12) are received; the freight-fee line is skipped.
    expect(store.inventory.all().map((r) => [r.productId, r.warehouseId, r.quantity])).toEqual([
      [PRODUCT_COOKIE, ids.mainDc, "110"],
      [PRODUCT_COOKIE, ids.westHub, "30"],
      [PRODUCT_TIN, ids.mainDc, qty(12)],
    ]);
    expect(db.updateInventory).toHaveBeenCalledTimes(1);
    expect(db.createInventory).toHaveBeenCalledTimes(1);
    expect(db.createInventory).toHaveBeenCalledWith({ productId: PRODUCT_TIN, warehouseId: ids.mainDc, quantity: qty(12), companyId: undefined });
    expect(db.createInventoryTransaction).toHaveBeenCalledTimes(2);
    expect(db.createInventoryTransaction).toHaveBeenNthCalledWith(1, expect.objectContaining({ transactionType: "receive", productId: PRODUCT_COOKIE, toWarehouseId: ids.mainDc, quantity: qty(40), referenceType: "purchase_order", referenceId: PURCHASE_ORDER_ID, performedBy: 1 }));
    expect(db.createInventoryTransaction).toHaveBeenNthCalledWith(2, expect.objectContaining({ productId: PRODUCT_TIN, quantity: qty(12) }));
    expect(db.updatePurchaseOrderItem).toHaveBeenCalledTimes(2);
    expect(store.purchaseOrderItems.all().map((i) => [i.productId, i.receivedQuantity])).toEqual([
      [PRODUCT_COOKIE, qty(40)],
      [null, qty(0)], // no product → nothing to receive, left untouched
      [PRODUCT_TIN, qty(12)],
    ]);
    expect(store.shipments.get(ids.poShipment)!.status).toBe("delivered");
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "update", entityType: "customs_clearance", entityId: ids.clearance }));

    // Re-saving an already-cleared clearance must not receive the goods a second time.
    vi.clearAllMocks();
    await ops.customs.clearances.update({ id: ids.clearance, status: "cleared", warehouseId: ids.mainDc, notes: "Broker invoice filed" });
    expect(db.updateInventory).not.toHaveBeenCalled();
    expect(db.createInventory).not.toHaveBeenCalled();
    expect(db.createInventoryTransaction).not.toHaveBeenCalled();
    expect(store.inventory.find((r) => r.productId === PRODUCT_COOKIE && r.warehouseId === ids.mainDc)!.quantity).toBe("110");
  });

  it("step 7: a vendor cannot create shipments, and other logistics writes are ops-only too", async () => {
    const vendor = appRouter.createCaller(ctxFor("vendor"));
    await expect(vendor.shipments.create({ type: "outbound", orderId: SALES_ORDER_ID })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(vendor.warehouses.create({ name: "Vendor WH", type: "warehouse" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(vendor.transfers.create({ fromWarehouseId: 1, toWarehouseId: 2, requestedDate: new Date() })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const finance = appRouter.createCaller(ctxFor("finance"));
    await expect(finance.customs.clearances.update({ id: ids.clearance, status: "held" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(finance.freight.quotes.accept({ quoteId: ids.groundQuote })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.createShipment).not.toHaveBeenCalled();
    expect(db.createWarehouse).not.toHaveBeenCalled();
    expect(db.createTransfer).not.toHaveBeenCalled();
    expect(db.updateCustomsClearance).not.toHaveBeenCalled();
    expect(db.updateFreightQuote).not.toHaveBeenCalled();
  });
});
