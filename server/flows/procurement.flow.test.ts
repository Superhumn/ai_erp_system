/**
 * Procurement + inventory process flow: vendor → raw material → purchase
 * order → send to supplier (portal) → receive (two receipts) → landed cost
 * → cycle count → adjustment / reorder signal → scoping + roles.
 *
 * Walks the real tRPC routers (appRouter.createCaller) and the real
 * inventoryCostingService on top of a stateful in-memory db mock. The db
 * helpers that hold procurement orchestration (receivePurchaseOrderItems,
 * approveCycleCount, adjustInventoryQuantity, ...) are re-implemented here
 * against the same contract as server/db.ts so the routers see faithful
 * state transitions; the pure cycle-count maths is the real module.
 *
 * The `it` blocks are sequential and share state on purpose.
 */
import { describe, it, expect, vi } from "vitest";
import { ctxFor } from "./_harness";

type Row = { id: number; [k: string]: any };

// ---------------------------------------------------------------------------
// In-memory database
// ---------------------------------------------------------------------------
const state = await vi.hoisted(async () => {
  const { table } = await import("./_harness");
  type Row = { id: number; [k: string]: any };
  return {
    users: table<Row>([
      { id: 1, name: "Ops One", email: "ops@example.com", role: "ops", isActive: true },
      { id: 2, name: "Ops Two (entity 2)", email: "ops2@example.com", role: "ops", isActive: true },
      { id: 3, name: "Admin", email: "admin@example.com", role: "admin", isActive: true },
      { id: 4, name: "Sales", email: "sales@example.com", role: "sales", isActive: true },
    ]),
    vendors: table<Row>(),
    // Products are owned by another module; the PO line links to a raw
    // material through a product with the same name/SKU (see purchaseOrders.create).
    products: table<Row>([
      { id: 1, companyId: 1, name: "Smoked Paprika", sku: "RM-PAP-01", status: "active", preferredVendorId: null },
    ]),
    rawMaterials: table<Row>(),
    purchaseOrders: table<Row>(),
    purchaseOrderItems: table<Row>(),
    purchaseOrderRawMaterials: table<Row>(),
    supplierPortalSessions: table<Row>(),
    supplierDocuments: table<Row>(),
    supplierFreightInfo: table<Row>(),
    poReceivingRecords: table<Row>(),
    poReceivingItems: table<Row>(),
    rawMaterialInventory: table<Row>(),
    rawMaterialTransactions: table<Row>(),
    inventoryCostLayers: table<Row>(),
    cogsRecords: table<Row>(),
    inventory: table<Row>(),
    inventoryTransactions: table<Row>(),
    cycleCounts: table<Row>(),
    cycleCountLines: table<Row>(),
    auditLogs: table<Row>(),
    notifications: [] as Array<{ event: any; userIds: number[] }>,
  };
});

vi.mock("../db", async () => {
  const { vi } = await import("vitest");
  const { scopeAllows, scopeCompanyIds } = await import("../_core/scope");
  const logic = await import("../cycleCountLogic");
  const s = state;
  type Scope = import("../_core/scope").Scope;

  const num = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
  const newestFirst = (a: Row, b: Row) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id;

  // ---- raw material inventory ------------------------------------------
  const getRawMaterialInventoryByLocation = async (rawMaterialId: number, warehouseId: number) =>
    s.rawMaterialInventory.find((r) => r.rawMaterialId === rawMaterialId && r.warehouseId === warehouseId);

  const upsertRawMaterialInventory = async (rawMaterialId: number, warehouseId: number, data: Record<string, unknown>) => {
    const existing = await getRawMaterialInventoryByLocation(rawMaterialId, warehouseId);
    if (existing) {
      s.rawMaterialInventory.update(existing.id, data);
      return { id: existing.id };
    }
    const row = s.rawMaterialInventory.insert({
      companyId: null,
      rawMaterialId,
      warehouseId,
      quantity: "0.0000",
      reservedQuantity: "0.0000",
      availableQuantity: "0.0000",
      unit: (data.unit as string) || "EA",
      ...data,
    });
    return { id: row.id };
  };

  const createRawMaterialTransaction = async (data: Record<string, unknown>) => {
    const row = s.rawMaterialTransactions.insert(data as any);
    return { id: row.id };
  };

  // ---- product inventory ledger ------------------------------------------
  // Mirrors db.addProductStock: upsert the aggregate product inventory row,
  // stamping the entity on a row it creates.
  const addProductStock = vi.fn(async (productId: number, warehouseId: number, quantity: number, companyId?: number | null) => {
    const existing = s.inventory.find((r) => r.productId === productId && r.warehouseId === warehouseId);
    if (existing) {
      s.inventory.update(existing.id, { quantity: (num(existing.quantity) + quantity).toString() });
      return { created: false };
    }
    s.inventory.insert({ productId, warehouseId, quantity: quantity.toString(), companyId: companyId ?? null, reservedQuantity: "0" });
    return { created: true };
  });
  const createInventoryTransaction = async (data: Record<string, unknown>) => {
    const transactionNumber = `TXN-${s.inventoryTransactions.all().length + 1}`;
    const row = s.inventoryTransactions.insert({ ...data, transactionNumber, performedAt: new Date() });
    return { id: row.id, transactionNumber };
  };

  const adjustInventoryQuantity = async (params: {
    productId: number; warehouseId: number; lotId?: number | null; quantityDelta: number;
    transactionType?: "adjust" | "scrap" | "count_adjust"; reasonCode: string; reason?: string;
    referenceType?: string; referenceId?: number; companyId?: number; unit?: string;
    balanceStatus?: string; performedBy?: number;
  }) => {
    const {
      productId, warehouseId, lotId, quantityDelta,
      transactionType = "adjust", reasonCode, reason,
      referenceType = "adjustment", referenceId,
      companyId, unit = "EA", balanceStatus = "available", performedBy,
    } = params;
    if (lotId) throw new Error("lot-level adjustments are not modelled in this flow");
    const aggregate = s.inventory.find((r) => r.productId === productId && r.warehouseId === warehouseId);
    const { previousQuantity, newQuantity } = logic.resolveAdjustment({
      currentQuantity: aggregate ? num(aggregate.quantity) : 0,
      quantityDelta,
    });
    if (aggregate) s.inventory.update(aggregate.id, { quantity: newQuantity.toString() });
    else s.inventory.insert({ companyId: companyId ?? null, productId, warehouseId, quantity: newQuantity.toString(), reservedQuantity: "0", reorderLevel: null, reorderQuantity: null, averageCost: null });
    const decrease = quantityDelta < 0;
    const txn = await createInventoryTransaction({
      transactionType,
      lotId: null,
      productId,
      fromWarehouseId: decrease ? warehouseId : null,
      toWarehouseId: decrease ? null : warehouseId,
      fromStatus: decrease ? balanceStatus : null,
      toStatus: decrease ? null : balanceStatus,
      quantity: Math.abs(quantityDelta).toString(),
      unit,
      previousBalance: previousQuantity.toString(),
      newBalance: newQuantity.toString(),
      referenceType,
      referenceId: referenceId ?? null,
      reasonCode,
      reason: reason ?? null,
      performedBy: performedBy ?? null,
    });
    return { ...txn, previousQuantity, newQuantity, lotPreviousQuantity: null, lotNewQuantity: null };
  };

  // ---- purchase order items (with raw material join) ---------------------
  const getPurchaseOrderItems = async (purchaseOrderId: number) =>
    s.purchaseOrderItems.filter((i) => i.purchaseOrderId === purchaseOrderId).map((item) => {
      const link = s.purchaseOrderRawMaterials.find((l) => l.purchaseOrderItemId === item.id);
      const rm = link ? s.rawMaterials.get(link.rawMaterialId) : undefined;
      return { ...item, rawMaterial: rm ? { id: rm.id, name: rm.name, sku: rm.sku, unit: rm.unit } : null };
    });

  // Copies, as a SQL row would be: a caller's "before" snapshot must not move
  // when the row is updated later in the same request.
  const getPurchaseOrderById = async (id: number) => {
    const po = s.purchaseOrders.get(id);
    return po ? { ...po } : undefined;
  };

  const getVendorById = vi.fn(async (id: number, scope?: Scope) => {
    const vendor = s.vendors.get(id);
    if (!vendor) return undefined;
    if (scope && !scopeAllows(scope, vendor.companyId)) return undefined;
    return vendor;
  });

  const getCycleCountById = async (id: number) => s.cycleCounts.get(id);
  const getCycleCountLines = async (countId: number) =>
    s.cycleCountLines.filter((l) => l.countId === countId).sort((a, b) => a.id - b.id);

  return {
    getDb: vi.fn(async () => ({})),

    // ---- entity scope lookups (no access rows: home company + regionScope) --
    getUserEntityAccessCompanyIds: vi.fn(async () => []),
    getCompanyById: vi.fn(async () => undefined),
    getCompanyIdsInRegion: vi.fn(async () => []),
    getEntityAndDescendantCompanyIds: vi.fn(async (id: number) => [id]),

    // ---- audit / notifications / users ----------------------------------
    createAuditLog: vi.fn(async (data: Record<string, unknown>) => { s.auditLogs.insert(data as any); }),
    getUsersByRoles: vi.fn(async (roles: string[]) => s.users.filter((u) => roles.includes(u.role) && u.isActive)),
    notifyUsersOfEvent: vi.fn(async (event: any, userIds: number[]) => {
      s.notifications.push({ event, userIds });
      return { inApp: userIds.length, email: 0 };
    }),
    getUserById: async (id: number) => s.users.get(id),

    // ---- vendors ---------------------------------------------------------
    getVendors: vi.fn(async (scope?: Scope) => {
      const ids = scope ? scopeCompanyIds(scope) : null;
      const rows = s.vendors.all().sort(newestFirst);
      if (!ids) return rows;
      if (ids.length === 0) return [];
      return rows.filter((v) => ids.includes(v.companyId));
    }),
    getVendorById,
    createVendor: async (data: Record<string, unknown>) => {
      const row = s.vendors.insert({ companyId: null, status: "active", type: "supplier", contactId: null, whatsappNumber: null, ...data });
      return { id: row.id };
    },

    // ---- products / raw materials ---------------------------------------
    getProductById: async (id: number) => s.products.get(id),
    getRawMaterials: async (filters?: { status?: string; category?: string }) =>
      s.rawMaterials
        .filter((r) => (!filters?.status || r.status === filters.status) && (!filters?.category || r.category === filters.category))
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    getRawMaterialById: async (id: number) => s.rawMaterials.get(id),
    getRawMaterialByNameOrSku: async (name: string, sku: string) =>
      s.rawMaterials.find((r) => r.name === name || r.sku === sku),
    createRawMaterial: async (data: Record<string, unknown>) => {
      const row = s.rawMaterials.insert({
        companyId: null, sku: null, description: null, category: null, unitCost: null, currency: "USD",
        minOrderQty: null, leadTimeDays: 0, preferredVendorId: null, status: "active", receivingStatus: "none",
        quantityOnOrder: "0", quantityInTransit: "0", quantityReceived: "0", notes: null, ...data,
      });
      return { id: row.id };
    },
    createPurchaseOrderRawMaterialLink: async (data: { purchaseOrderItemId: number; rawMaterialId: number; orderedQuantity: string; unit: string }) => {
      const row = s.purchaseOrderRawMaterials.insert({ ...data, receivedQuantity: "0", status: "ordered" });
      return { id: row.id };
    },

    // ---- purchase orders -------------------------------------------------
    createPurchaseOrder: vi.fn(async (data: Record<string, unknown>) => {
      const row = s.purchaseOrders.insert({
        companyId: null, status: "draft", taxAmount: "0", shippingAmount: "0", currency: "USD",
        expectedDate: null, receivedDate: null, approvedBy: null, approvedAt: null, notes: null, shippingAddress: null, ...data,
      });
      return { id: row.id };
    }),
    createPurchaseOrderItem: async (data: Record<string, unknown>) => {
      const row = s.purchaseOrderItems.insert({ receivedQuantity: "0", productId: null, ...data });
      return { id: row.id };
    },
    getPurchaseOrderById,
    getPurchaseOrderItems,
    getAllPurchaseOrderItems: async () => s.purchaseOrderItems.all(),
    getPurchaseOrderWithItems: async (id: number) => {
      const po = s.purchaseOrders.get(id);
      if (!po) return undefined;
      const items = await getPurchaseOrderItems(id);
      const vendor = po.vendorId ? s.vendors.get(po.vendorId) : null;
      const createdByName = po.createdBy ? s.users.get(po.createdBy)?.name ?? null : null;
      return { ...po, items, vendor: vendor ?? null, createdByName, approvedByName: null };
    },
    updatePurchaseOrder: async (id: number, data: Record<string, unknown>) => { s.purchaseOrders.update(id, data); },
    getPurchaseOrders: async (filters?: { companyId?: number; status?: string; vendorId?: number; limit?: number }) => {
      let rows = s.purchaseOrders.all().sort(newestFirst);
      if (filters?.companyId) rows = rows.filter((p) => p.companyId === filters.companyId);
      if (filters?.status) rows = rows.filter((p) => p.status === filters.status);
      if (filters?.vendorId) rows = rows.filter((p) => p.vendorId === filters.vendorId);
      if (filters?.limit) rows = rows.slice(0, filters.limit);
      return rows.map((po) => ({ ...po, vendor: s.vendors.get(po.vendorId) ?? null }));
    },
    getPurchaseOrdersPaged: vi.fn(async (filters: { status?: string; vendorId?: number; limit?: number; offset?: number } = {}, scope?: Scope) => {
      let rows = s.purchaseOrders.all().sort(newestFirst);
      const ids = scope ? scopeCompanyIds(scope) : null;
      if (ids) {
        if (ids.length === 0) return { rows: [], total: 0 };
        rows = rows.filter((p) => ids.includes(p.companyId));
      }
      if (filters.status) rows = rows.filter((p) => p.status === filters.status);
      if (filters.vendorId) rows = rows.filter((p) => p.vendorId === filters.vendorId);
      const total = rows.length;
      rows = rows.slice(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 50));
      return { rows: rows.map((po) => ({ ...po, vendor: s.vendors.get(po.vendorId) ?? null })), total };
    }),

    // ---- supplier portal -------------------------------------------------
    createSupplierPortalSession: vi.fn(async (data: { token: string; purchaseOrderId: number; vendorId: number; vendorEmail?: string; expiresAt: Date }) => {
      const row = s.supplierPortalSessions.insert({ status: "active", completedAt: null, ...data });
      return { id: row.id, ...data };
    }),
    getSupplierPortalSession: async (token: string) => s.supplierPortalSessions.find((r) => r.token === token) ?? null,
    updateSupplierPortalSession: async (id: number, data: Record<string, unknown>) => { s.supplierPortalSessions.update(id, data); },
    createSupplierDocument: async (data: Record<string, unknown>) => {
      const row = s.supplierDocuments.insert({ status: "pending", ...data });
      return { id: row.id, ...data };
    },
    getSupplierDocuments: async (filters?: { purchaseOrderId?: number; vendorId?: number; portalSessionId?: number }) =>
      s.supplierDocuments.filter((d) =>
        (!filters?.purchaseOrderId || d.purchaseOrderId === filters.purchaseOrderId) &&
        (!filters?.vendorId || d.vendorId === filters.vendorId) &&
        (!filters?.portalSessionId || d.portalSessionId === filters.portalSessionId),
      ).sort(newestFirst),
    getSupplierFreightInfo: async (purchaseOrderId: number) =>
      s.supplierFreightInfo.find((f) => f.purchaseOrderId === purchaseOrderId) ?? null,
    createSupplierFreightInfo: async (data: Record<string, unknown>) => {
      const row = s.supplierFreightInfo.insert(data as any);
      return { id: row.id, ...data };
    },
    updateSupplierFreightInfo: async (id: number, data: Record<string, unknown>) => { s.supplierFreightInfo.update(id, data); },

    // ---- receiving -------------------------------------------------------
    getPoReceivingRecords: async (purchaseOrderId: number) =>
      s.poReceivingRecords.filter((r) => r.purchaseOrderId === purchaseOrderId).sort((a, b) => b.receivedDate - a.receivedDate),
    getPoReceivingItems: async (receivingRecordId: number) =>
      s.poReceivingItems.filter((r) => r.receivingRecordId === receivingRecordId),
    // Mirrors db.receivePurchaseOrderItems: receiving record + items, raw material
    // inventory upsert + ledger row, product lines booked into the aggregate
    // inventory row (+ receive ledger row), PO item receivedQuantity increment,
    // PO status partial/received, then a cost layer per product line at the PO unit price.
    receivePurchaseOrderItems: vi.fn(async (
      purchaseOrderId: number,
      warehouseId: number,
      items: Array<{ purchaseOrderItemId: number; rawMaterialId?: number; productId?: number; quantity: number; unit: string; lotNumber?: string; expirationDate?: Date }>,
      receivedBy?: number,
      shipmentId?: number,
    ) => {
      const po = s.purchaseOrders.get(purchaseOrderId);
      const receiving = s.poReceivingRecords.insert({
        purchaseOrderId, shipmentId: shipmentId ?? null, receivedDate: new Date(), receivedBy: receivedBy ?? null, warehouseId,
      });
      for (const item of items) {
        s.poReceivingItems.insert({
          receivingRecordId: receiving.id,
          purchaseOrderItemId: item.purchaseOrderItemId,
          rawMaterialId: item.rawMaterialId ?? null,
          productId: item.productId ?? null,
          receivedQuantity: item.quantity.toString(),
          unit: item.unit,
          lotNumber: item.lotNumber ?? null,
          expirationDate: item.expirationDate ?? null,
          condition: "good",
        });
        if (item.rawMaterialId) {
          const currentInv = await getRawMaterialInventoryByLocation(item.rawMaterialId, warehouseId);
          const currentQty = num(currentInv?.quantity);
          const newQty = currentQty + item.quantity;
          await upsertRawMaterialInventory(item.rawMaterialId, warehouseId, {
            quantity: newQty.toFixed(4),
            availableQuantity: newQty.toFixed(4),
            unit: item.unit,
            lastReceivedDate: new Date(),
            lotNumber: item.lotNumber,
            expirationDate: item.expirationDate,
          });
          await createRawMaterialTransaction({
            rawMaterialId: item.rawMaterialId,
            warehouseId,
            transactionType: "receive",
            quantity: item.quantity.toFixed(4),
            previousQuantity: currentQty.toFixed(4),
            newQuantity: newQty.toFixed(4),
            unit: item.unit,
            referenceType: "purchase_order",
            referenceId: purchaseOrderId,
            lotNumber: item.lotNumber,
            performedBy: receivedBy,
          });
        }
        if (item.productId && item.quantity > 0) {
          await addProductStock(item.productId, warehouseId, item.quantity, po?.companyId ?? null);
          await createInventoryTransaction({
            transactionType: "receive", productId: item.productId, toWarehouseId: warehouseId, toStatus: "available",
            quantity: item.quantity.toString(), unit: item.unit, referenceType: "purchase_order", referenceId: purchaseOrderId,
            performedBy: receivedBy, reason: `PO receipt${item.lotNumber ? ` (lot ${item.lotNumber})` : ""}`,
          });
        }
        const poItem = s.purchaseOrderItems.get(item.purchaseOrderItemId);
        if (poItem) s.purchaseOrderItems.update(poItem.id, { receivedQuantity: (num(poItem.receivedQuantity) + item.quantity).toFixed(4) });
      }

      const poItems = s.purchaseOrderItems.filter((i) => i.purchaseOrderId === purchaseOrderId);
      let allReceived = true;
      let anyReceived = false;
      for (const poi of poItems) {
        const ordered = num(poi.quantity);
        const received = num(poi.receivedQuantity);
        if (received >= ordered) anyReceived = true;
        else if (received > 0) { anyReceived = true; allReceived = false; }
        else allReceived = false;
      }
      if (allReceived) s.purchaseOrders.update(purchaseOrderId, { status: "received", receivedDate: new Date() });
      else if (anyReceived) s.purchaseOrders.update(purchaseOrderId, { status: "partial" });

      for (const item of items) {
        if (item.productId && item.quantity > 0) {
          const poItem = poItems.find((poi) => poi.id === item.purchaseOrderItemId);
          const unitPrice = num(poItem?.unitPrice);
          if (unitPrice > 0) {
            const { addCostLayer } = await import("../inventoryCostingService");
            await addCostLayer({
              productId: item.productId,
              warehouseId: warehouseId || undefined,
              quantity: item.quantity,
              unitCost: unitPrice,
              purchaseOrderId,
              referenceType: "purchase_order",
              referenceId: purchaseOrderId,
            });
          }
        }
      }
      return { id: receiving.id };
    }),

    // ---- raw material inventory -----------------------------------------
    getRawMaterialInventory: async (filters?: { rawMaterialId?: number; warehouseId?: number }) =>
      s.rawMaterialInventory.filter((r) =>
        (!filters?.rawMaterialId || r.rawMaterialId === filters.rawMaterialId) &&
        (!filters?.warehouseId || r.warehouseId === filters.warehouseId),
      ),
    getRawMaterialInventoryByLocation,
    upsertRawMaterialInventory,
    createRawMaterialTransaction,
    getRawMaterialTransactions: async (rawMaterialId: number, limit = 50) =>
      s.rawMaterialTransactions.filter((t) => t.rawMaterialId === rawMaterialId).sort(newestFirst).slice(0, limit),

    // ---- cost layers (consumed by the real inventoryCostingService) -------
    createInventoryCostLayer: vi.fn(async (data: Record<string, unknown>) => {
      const row = s.inventoryCostLayers.insert({ companyId: null, warehouseId: null, purchaseOrderId: null, lotId: null, ...data });
      return { id: row.id };
    }),
    getActiveCostLayers: async (productId: number, order: "asc" | "desc" = "asc", warehouseId?: number) => {
      const rows = s.inventoryCostLayers.filter((l) =>
        l.productId === productId && l.status === "active" && (warehouseId === undefined || l.warehouseId === warehouseId),
      );
      rows.sort((a, b) => (a.layerDate.getTime() - b.layerDate.getTime() || a.id - b.id) * (order === "desc" ? -1 : 1));
      return rows;
    },
    updateInventoryCostLayer: vi.fn(async (id: number, data: Record<string, unknown>) => { s.inventoryCostLayers.update(id, data); }),
    getInventoryCostLayers: async (filters?: { productId?: number; warehouseId?: number; status?: string }) =>
      s.inventoryCostLayers.filter((l) =>
        (!filters?.productId || l.productId === filters.productId) &&
        (!filters?.warehouseId || l.warehouseId === filters.warehouseId) &&
        (!filters?.status || l.status === filters.status),
      ),
    createCogsRecord: async (data: Record<string, unknown>) => ({ id: s.cogsRecords.insert(data as any).id }),
    dbTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn({}),

    // ---- product inventory ----------------------------------------------
    createInventory: async (data: Record<string, unknown>) => {
      const row = s.inventory.insert({ companyId: null, warehouseId: null, reservedQuantity: "0", reorderLevel: null, reorderQuantity: null, averageCost: null, lastCountDate: null, lastCountQuantity: null, ...data });
      return { id: row.id };
    },
    getInventoryByIds: async (ids: number[]) => s.inventory.filter((r) => ids.includes(r.id)),
    updateInventory: async (id: number, data: Record<string, unknown>) => { s.inventory.update(id, data); },
    getInventoryByProductAndWarehouse: async (productId: number, warehouseId: number) =>
      s.inventory.find((r) => r.productId === productId && r.warehouseId === warehouseId),
    addProductStock,
    getInventory: vi.fn(async (scope?: Scope, filters?: { warehouseId?: number; productId?: number; limit?: number }) => {
      let rows = s.inventory.all();
      const ids = scope ? scopeCompanyIds(scope) : null;
      if (ids) {
        if (ids.length === 0) return [];
        rows = rows.filter((r) => ids.includes(r.companyId));
      }
      if (filters?.warehouseId) rows = rows.filter((r) => r.warehouseId === filters.warehouseId);
      if (filters?.productId) rows = rows.filter((r) => r.productId === filters.productId);
      return rows.map((r) => ({ ...r, product: s.products.get(r.productId) ?? null }));
    }),
    adjustInventoryQuantity: vi.fn(adjustInventoryQuantity),
    getInventoryTransactionHistory: async (filters?: { productId?: number; lotId?: number; warehouseId?: number; type?: string }, limit = 100) =>
      s.inventoryTransactions.filter((t) =>
        (!filters?.productId || t.productId === filters.productId) &&
        (!filters?.warehouseId || t.fromWarehouseId === filters.warehouseId || t.toWarehouseId === filters.warehouseId) &&
        (!filters?.type || t.transactionType === filters.type),
      ).sort(newestFirst).slice(0, limit),
    // Simplified replenishment: the real helper also folds in demand history,
    // vendor lead time and open POs (server/db.ts getReplenishmentPlan). A
    // hand-entered reorder level wins in both, which is what this flow checks.
    getReplenishmentPlan: vi.fn(async (params?: { warehouseId?: number; onlyActionable?: boolean; windowDays?: number }) => {
      const plan = s.inventory
        .filter((r) => !params?.warehouseId || r.warehouseId === params.warehouseId)
        .map((r) => {
          const product = s.products.get(r.productId);
          if (!product || product.status !== "active") return null;
          const vendor = product.preferredVendorId ? s.vendors.get(product.preferredVendorId) : undefined;
          const onHand = num(r.quantity);
          const reserved = num(r.reservedQuantity);
          const reorderLevel = r.reorderLevel != null ? num(r.reorderLevel) : null;
          const reorderQuantity = r.reorderQuantity != null ? num(r.reorderQuantity) : null;
          const shouldOrder = reorderLevel != null && onHand - reserved <= reorderLevel;
          return {
            inventoryId: r.id, productId: r.productId, warehouseId: r.warehouseId,
            sku: product.sku, productName: product.name,
            preferredVendorId: product.preferredVendorId, vendorName: vendor?.name ?? null,
            windowDays: params?.windowDays ?? 90, onOrder: 0, onHand, reserved, reorderLevel, reorderQuantity,
            shouldOrder, suggestedQuantity: shouldOrder ? (reorderQuantity ?? 0) : 0,
            reason: shouldOrder ? "reorder_level" : "ok",
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      return params?.onlyActionable ? plan.filter((row) => row.shouldOrder) : plan;
    }),

    // ---- cycle counts ----------------------------------------------------
    createCycleCount: async (data: Record<string, unknown>) => {
      const countNumber = `CC-${(s.cycleCounts.all().length + 1).toString().padStart(4, "0")}`;
      const row = s.cycleCounts.insert({ companyId: null, status: "draft", scheduledDate: null, startedAt: null, completedAt: null, approvedBy: null, approvedAt: null, notes: null, ...data, countNumber });
      return { id: row.id, countNumber };
    },
    getCycleCounts: async (filters?: { warehouseId?: number; status?: string; limit?: number }) =>
      s.cycleCounts.filter((c) => (!filters?.warehouseId || c.warehouseId === filters.warehouseId) && (!filters?.status || c.status === filters.status))
        .sort(newestFirst).slice(0, filters?.limit ?? 100),
    getCycleCountById,
    getCycleCountLines,
    generateCycleCountLines: async (countId: number, options?: { productIds?: number[]; includeZeroQuantity?: boolean }) => {
      const count = await getCycleCountById(countId);
      if (!count) throw new Error("Cycle count not found");
      if (count.status !== "draft") throw new Error(`Lines can only be generated while the count is in draft (currently ${count.status})`);
      for (const line of s.cycleCountLines.filter((l) => l.countId === countId && l.status === "pending")) s.cycleCountLines.remove(line.id);
      let rows = s.inventory.filter((r) => r.warehouseId === count.warehouseId);
      if (options?.productIds?.length) rows = rows.filter((r) => options.productIds!.includes(r.productId));
      let linesGenerated = 0;
      for (const row of rows) {
        const qty = num(row.quantity);
        if (qty === 0 && !options?.includeZeroQuantity) continue;
        s.cycleCountLines.insert({
          countId, productId: row.productId, lotId: null, warehouseId: count.warehouseId, zoneId: null, binId: null,
          systemQuantity: qty.toString(), countedQuantity: null, variance: null, varianceValue: null,
          unit: "EA", status: "pending", reasonCode: null, notes: null, countedBy: null, countedAt: null,
        });
        linesGenerated += 1;
      }
      return { countId, linesGenerated };
    },
    recordCycleCountLine: async (lineId: number, params: { countedQuantity: number; reasonCode?: string; notes?: string; countedBy?: number }) => {
      const line = s.cycleCountLines.get(lineId);
      if (!line) throw new Error("Cycle count line not found");
      const count = await getCycleCountById(line.countId);
      if (!count) throw new Error("Cycle count not found");
      if (count.status !== "in_progress" && count.status !== "pending_review") {
        throw new Error(`Counts can only be recorded while the count is open (currently ${count.status})`);
      }
      if (params.countedQuantity < 0) throw new Error("Counted quantity cannot be negative");
      const systemQuantity = num(line.systemQuantity);
      const variance = logic.computeVariance(systemQuantity, params.countedQuantity);
      const aggregate = s.inventory.find((r) => r.productId === line.productId && r.warehouseId === line.warehouseId);
      const avgCost = aggregate?.averageCost ? num(aggregate.averageCost) : 0;
      s.cycleCountLines.update(lineId, {
        countedQuantity: params.countedQuantity.toString(),
        variance: variance.toString(),
        varianceValue: logic.computeVarianceValue(variance, avgCost).toFixed(2),
        reasonCode: params.reasonCode ?? line.reasonCode,
        notes: params.notes ?? line.notes,
        status: "counted",
        countedBy: params.countedBy ?? null,
        countedAt: new Date(),
      });
      return { id: lineId, systemQuantity, countedQuantity: params.countedQuantity, variance };
    },
    startCycleCount: async (id: number) => {
      const count = await getCycleCountById(id);
      if (!count) throw new Error("Cycle count not found");
      logic.assertTransition(count.status, "in_progress");
      const lines = await getCycleCountLines(id);
      if (lines.length === 0) throw new Error("Generate count lines before starting the count");
      s.cycleCounts.update(id, { status: "in_progress", startedAt: new Date() });
      return { success: true, lineCount: lines.length };
    },
    submitCycleCountForReview: async (id: number) => {
      const count = await getCycleCountById(id);
      if (!count) throw new Error("Cycle count not found");
      logic.assertTransition(count.status, "pending_review");
      const uncounted = logic.uncountedLines(await getCycleCountLines(id));
      if (uncounted.length > 0) throw new Error(`${uncounted.length} line(s) still need a count before review`);
      s.cycleCounts.update(id, { status: "pending_review", completedAt: new Date() });
      return { success: true };
    },
    approveCycleCount: async (id: number, approvedBy: number) => {
      const count = await getCycleCountById(id);
      if (!count) throw new Error("Cycle count not found");
      logic.assertTransition(count.status, "approved");
      const lines = await getCycleCountLines(id);
      const countedAt = new Date();
      const posted: { lineId: number; variance: number; transactionNumber: string }[] = [];
      const failed: { lineId: number; error: string }[] = [];
      for (const line of lines) {
        const variance = num(line.variance);
        const countedQuantity = num(line.countedQuantity);
        if (variance !== 0) {
          try {
            const txn = await adjustInventoryQuantity({
              productId: line.productId, warehouseId: line.warehouseId, lotId: line.lotId,
              quantityDelta: variance, transactionType: "count_adjust",
              reasonCode: line.reasonCode || "data_entry_error",
              reason: `Cycle count ${count.countNumber}: system ${line.systemQuantity}, counted ${line.countedQuantity}`,
              referenceType: "cycle_count", referenceId: id,
              companyId: count.companyId ?? undefined, unit: line.unit, performedBy: approvedBy,
            });
            posted.push({ lineId: line.id, variance, transactionNumber: txn.transactionNumber });
          } catch (error) {
            failed.push({ lineId: line.id, error: (error as Error).message });
            continue;
          }
        }
        s.cycleCountLines.update(line.id, { status: "approved" });
        const agg = s.inventory.find((r) => r.productId === line.productId && r.warehouseId === line.warehouseId);
        if (agg) s.inventory.update(agg.id, { lastCountDate: countedAt, lastCountQuantity: countedQuantity.toString() });
      }
      s.cycleCounts.update(id, { status: "approved", approvedBy, approvedAt: countedAt });
      return { success: true, countNumber: count.countNumber, linesApproved: lines.length, adjustmentsPosted: posted.length, adjustmentsFailed: failed.length, posted, failed };
    },
    getCycleCountVarianceSummary: async (countId: number) => logic.summarizeVariance(await getCycleCountLines(countId)),
  };
});

// Side-effect modules: outbound email and object storage.
vi.mock("../_core/email", () => ({
  isEmailConfigured: vi.fn(() => true),
  sendEmail: vi.fn(async () => ({ success: true, messageId: "msg-1" })),
  sendBulkEmails: vi.fn(async () => []),
  formatEmailHtml: vi.fn((html: string) => `<html>${html}</html>`),
}));
vi.mock("../storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://files.test/${key}` })),
  storageGet: vi.fn(async (key: string) => ({ key, url: `https://files.test/${key}` })),
  storageDelete: vi.fn(async () => undefined),
}));

import * as db from "../db";
import * as email from "../_core/email";
import * as storage from "../storage";
import { appRouter } from "../routers";

const WAREHOUSE_MAIN = 1;
const WAREHOUSE_OTHER = 2;

const ops = appRouter.createCaller(ctxFor("ops"));
const admin = appRouter.createCaller(ctxFor("admin", { id: 3 }));
const sales = appRouter.createCaller(ctxFor("sales", { id: 4 }));
// Ops user of another legal entity: no access rows, home company 2, entity scope.
const otherEntityOps = appRouter.createCaller(ctxFor("ops", { id: 2, companyId: 2, regionScope: "entity" }));
const supplier = appRouter.createCaller({ ...ctxFor("ops"), user: null } as any);

const auditRows = (entityType: string, action?: string) =>
  state.auditLogs.filter((a) => a.entityType === entityType && (!action || a.action === action));

let vendorId = 0;
let rawMaterialId = 0;
const productId = 1;
let inventoryId = 0;
let poId = 0;
let poNumber = "";
let poItemId = 0;
let portalToken = "";
let draftPoId = 0;
let countId = 0;
let countLineId = 0;

describe("procurement flow: vendor → PO → supplier portal → receipt → landed cost → count → reorder", () => {
  // -------------------------------------------------------------------------
  it("1. ops creates a vendor and a raw material with a preferred vendor, and a stock record with a reorder point", async () => {
    const vendor = await ops.vendors.create({
      name: "Sunrise Spice Co",
      companyId: 1,
      contactName: "Ana Ruiz",
      email: "orders@sunrise-spice.test",
      type: "supplier",
      paymentTerms: 30,
      defaultLeadTimeDays: 7,
    });
    vendorId = vendor.id;
    expect(vendorId).toBe(1);

    const readBack = await ops.vendors.get({ id: vendorId });
    expect(readBack).toMatchObject({ id: vendorId, name: "Sunrise Spice Co", companyId: 1, email: "orders@sunrise-spice.test", status: "active", defaultLeadTimeDays: 7 });
    expect((await ops.vendors.list()).map((v) => v.id)).toEqual([vendorId]);
    expect(auditRows("vendor", "create")).toHaveLength(1);
    expect(auditRows("vendor", "create")[0]).toMatchObject({ userId: 1, entityId: vendorId, entityName: "Sunrise Spice Co" });

    const material = await ops.rawMaterials.create({
      name: "Smoked Paprika",
      sku: "RM-PAP-01",
      unit: "kg",
      unitCost: "12.50",
      minOrderQty: "25",
      leadTimeDays: 7,
      preferredVendorId: vendorId,
      category: "spice",
    });
    rawMaterialId = material.id;
    expect(rawMaterialId).toBe(1);
    expect(await ops.rawMaterials.get({ id: rawMaterialId })).toMatchObject({
      name: "Smoked Paprika", sku: "RM-PAP-01", unit: "kg", unitCost: "12.50", preferredVendorId: vendorId, status: "active",
    });
    expect((await ops.rawMaterials.list({ category: "spice" })).map((m) => m.id)).toEqual([rawMaterialId]);

    // The material knows its preferred vendor even before any PO history exists.
    const preferred = await ops.rawMaterials.getPreferredVendor({ materialId: rawMaterialId });
    expect(preferred.preferredVendor).toMatchObject({ id: vendorId, name: "Sunrise Spice Co" });
    expect(preferred.recentPOCount).toBe(0);

    // Reorder point: rawMaterials has no reorder column, so the planning record
    // is the product inventory row (inventory.reorderLevel). Nothing on hand yet.
    state.products.update(productId, { preferredVendorId: vendorId });
    const inv = await ops.inventory.create({ productId, warehouseId: WAREHOUSE_MAIN, quantity: "0", reorderLevel: "40", reorderQuantity: "100" });
    inventoryId = inv.id;
    expect(state.inventory.get(inventoryId)).toMatchObject({ productId, warehouseId: WAREHOUSE_MAIN, quantity: "0", reorderLevel: "40", companyId: 1 });
  });

  // -------------------------------------------------------------------------
  it("2. ops raises a draft purchase order whose line is linked to the raw material", async () => {
    // Exactly what client/src/pages/operations/PurchaseOrders.tsx sends.
    const created = await ops.purchaseOrders.create({
      vendorId,
      orderDate: new Date("2026-09-01T00:00:00Z"),
      expectedDate: new Date("2026-09-10T00:00:00Z"),
      subtotal: "1250.00",
      taxAmount: "0",
      totalAmount: "1250.00",
      notes: "Autumn run",
      items: [{ productId, description: "Smoked Paprika", quantity: "100", unitPrice: "12.50", totalAmount: "1250.00" }],
    });
    poId = created.id;
    expect(poId).toBe(1);

    const po = await ops.purchaseOrders.get({ id: poId });
    expect(po).toBeDefined();
    poNumber = po!.poNumber;
    expect(poNumber).toMatch(/^PO-\d{4}-\d{4}$/);
    expect(po).toMatchObject({
      status: "draft", vendorId, subtotal: "1250.00", taxAmount: "0", totalAmount: "1250.00", createdBy: 1, createdByName: "Ops One",
      // Scoped to the creator's home entity so entity-scoped lists/gets can see it.
      companyId: 1,
    });
    expect(po!.vendor).toMatchObject({ id: vendorId, name: "Sunrise Spice Co" });
    expect(po!.items).toHaveLength(1);
    poItemId = po!.items[0].id;
    expect(po!.items[0]).toMatchObject({
      productId, description: "Smoked Paprika", quantity: "100", unitPrice: "12.50", totalAmount: "1250.00", receivedQuantity: "0",
      rawMaterial: { id: rawMaterialId, name: "Smoked Paprika", sku: "RM-PAP-01", unit: "kg" },
    });
    // The junction row the UI relies on to show material name/unit.
    expect(state.purchaseOrderRawMaterials.all()).toEqual([
      expect.objectContaining({ purchaseOrderItemId: poItemId, rawMaterialId, orderedQuantity: "100", receivedQuantity: "0", unit: "kg", status: "ordered" }),
    ]);
    expect(auditRows("purchaseOrder", "create")).toEqual([expect.objectContaining({ userId: 1, entityId: poId, entityName: poNumber })]);

    // Nothing has been received: the PO cannot be receipted while a draft.
    await expect(ops.purchaseOrders.receiveItems({ id: poId, items: [{ purchaseOrderItemId: poItemId, receivedQuantity: "10" }] }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  // -------------------------------------------------------------------------
  it("3. sending the PO emails the supplier, marks it sent and opens a portal session the supplier can use", async () => {
    const sent = await ops.purchaseOrders.sendToSupplier({ poId, message: "Please confirm ship date." });
    expect(sent.success).toBe(true);
    portalToken = sent.portalToken;
    expect(portalToken).toHaveLength(32);
    expect(sent.shipmentId).toBeUndefined();
    expect(sent.rfqId).toBeUndefined();

    // Email went to the vendor's address with the PO number and the portal link.
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    const mail = (email.sendEmail as any).mock.calls[0][0];
    expect(mail.to).toBe("orders@sunrise-spice.test");
    expect(mail.subject).toBe(`Purchase Order ${poNumber} - Action Required`);
    expect(mail.html).toContain(`/supplier-portal/${portalToken}`);
    expect(mail.html).toContain("Please confirm ship date.");
    expect(mail.html).toContain("Smoked Paprika");

    expect(state.purchaseOrders.get(poId)!.status).toBe("sent");
    expect(auditRows("purchaseOrder", "update")).toHaveLength(1);

    // Portal session persisted with the same token, bound to the PO and vendor.
    expect(db.createSupplierPortalSession).toHaveBeenCalledWith(expect.objectContaining({
      token: portalToken, purchaseOrderId: poId, vendorId, vendorEmail: "orders@sunrise-spice.test",
    }));
    const session = state.supplierPortalSessions.find((r) => r.token === portalToken)!;
    expect(session).toMatchObject({ purchaseOrderId: poId, vendorId, status: "active" });
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);

    // --- supplier side (public procedures, no login) ---
    const portal = await supplier.supplierPortal.getSession({ token: portalToken });
    expect(portal).not.toBeNull();
    expect(portal!.purchaseOrder).toMatchObject({ id: poId, poNumber, status: "sent", totalAmount: "1250.00" });
    expect(portal!.purchaseOrder!.items).toHaveLength(1);
    expect(await supplier.supplierPortal.getSession({ token: "not-a-real-token" })).toBeNull();

    const doc = await supplier.supplierPortal.uploadDocument({
      token: portalToken,
      documentType: "commercial_invoice",
      fileName: "invoice-4471.pdf",
      fileData: Buffer.from("hello").toString("base64"),
      mimeType: "application/pdf",
    });
    expect(storage.storagePut).toHaveBeenCalledTimes(1);
    const [storedKey, storedBody, storedType] = (storage.storagePut as any).mock.calls[0];
    expect(storedKey).toMatch(new RegExp(`^supplier-docs/${poId}/commercial_invoice/\\d+-invoice-4471\\.pdf$`));
    expect(Buffer.isBuffer(storedBody) && storedBody.toString()).toBe("hello");
    expect(storedType).toBe("application/pdf");
    expect(doc).toMatchObject({ purchaseOrderId: poId, vendorId, portalSessionId: session.id, documentType: "commercial_invoice", fileName: "invoice-4471.pdf", fileSize: 5 });
    expect(doc.fileUrl).toBe(`https://files.test/${storedKey}`);
    expect(await supplier.supplierPortal.getDocuments({ token: portalToken })).toHaveLength(1);
    // Ops sees the same document from the PO side (mocked normalization is out of scope; row exists).
    expect(state.supplierDocuments.filter((d) => d.purchaseOrderId === poId)).toHaveLength(1);

    const freight = await supplier.supplierPortal.saveFreightInfo({
      token: portalToken, totalPackages: 4, totalGrossWeight: "110.5", weightUnit: "kg", incoterms: "FOB", hsCodes: "0904.22",
    });
    expect(freight).toEqual({ success: true, id: 1 });
    expect(await supplier.supplierPortal.getFreightInfo({ token: portalToken })).toMatchObject({
      purchaseOrderId: poId, vendorId, totalPackages: 4, totalGrossWeight: "110.5", incoterms: "FOB",
    });
    // A second save updates the same record rather than adding another.
    expect(await supplier.supplierPortal.saveFreightInfo({ token: portalToken, totalPackages: 5 })).toEqual({ success: true, id: 1 });
    expect(state.supplierFreightInfo.all()).toHaveLength(1);
    expect(state.supplierFreightInfo.get(1)).toMatchObject({ totalPackages: 5, incoterms: "FOB" });

    await expect(supplier.supplierPortal.uploadDocument({ token: "bogus", documentType: "x", fileName: "x", fileData: "" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    // Supplier confirms → PO confirmed, session completed.
    expect(await supplier.supplierPortal.completeSubmission({ token: portalToken })).toEqual({ success: true });
    expect(state.purchaseOrders.get(poId)!.status).toBe("confirmed");
    expect(state.supplierPortalSessions.get(session.id)).toMatchObject({ status: "completed" });
    expect(state.supplierPortalSessions.get(session.id)!.completedAt).toBeInstanceOf(Date);

    // A completed session no longer opens the PO (getSession used to ignore
    // the status while every other portal procedure required "active").
    expect(await supplier.supplierPortal.getSession({ token: portalToken })).toBeNull();
    await expect(supplier.supplierPortal.completeSubmission({ token: portalToken })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // And a confirmed PO cannot be sent again: no new session, no second email, status untouched.
    await expect(ops.purchaseOrders.sendToSupplier({ poId })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED", message: `Purchase order ${poNumber} is confirmed and cannot be sent to the supplier.`,
    });
    expect(db.createSupplierPortalSession).toHaveBeenCalledTimes(1);
    expect(state.supplierPortalSessions.all()).toHaveLength(1);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(state.purchaseOrders.get(poId)!.status).toBe("confirmed");
  });

  // -------------------------------------------------------------------------
  it("4. receiving in two deliveries books stock into the right warehouse, creates cost layers at PO price, and moves the PO partial → received", async () => {
    // First delivery: 60 of 100 kg.
    const first = await ops.poReceiving.receive({
      purchaseOrderId: poId,
      warehouseId: WAREHOUSE_MAIN,
      items: [{ purchaseOrderItemId: poItemId, rawMaterialId, productId, quantity: 60, unit: "kg", lotNumber: "LOT-A" }],
    });
    expect(first).toEqual({ id: 1 });
    expect(db.receivePurchaseOrderItems).toHaveBeenCalledWith(poId, WAREHOUSE_MAIN, expect.any(Array), 1, undefined);

    expect(await ops.rawMaterialInventory.list({ rawMaterialId, warehouseId: WAREHOUSE_MAIN })).toEqual([
      expect.objectContaining({ rawMaterialId, warehouseId: WAREHOUSE_MAIN, quantity: "60.0000", availableQuantity: "60.0000", unit: "kg", lotNumber: "LOT-A" }),
    ]);
    expect(await ops.rawMaterialInventory.list({ rawMaterialId, warehouseId: WAREHOUSE_OTHER })).toEqual([]);
    expect(state.purchaseOrders.get(poId)!.status).toBe("partial");
    expect(state.purchaseOrderItems.get(poItemId)!.receivedQuantity).toBe("60.0000");

    // The product line also reaches the aggregate inventory row (the planning
    // record with the reorder point) with a receive ledger entry — previously
    // only rawMaterialInventory and the cost layers moved.
    expect(db.addProductStock).toHaveBeenCalledWith(productId, WAREHOUSE_MAIN, 60, 1);
    expect(state.inventory.get(inventoryId)).toMatchObject({ productId, warehouseId: WAREHOUSE_MAIN, quantity: "60", companyId: 1 });
    expect(state.inventory.all()).toHaveLength(1);
    expect(await ops.inventory.getMovementHistory({ productId, type: "receive" })).toEqual([
      expect.objectContaining({ transactionNumber: "TXN-1", productId, toWarehouseId: WAREHOUSE_MAIN, quantity: "60", referenceType: "purchase_order", referenceId: poId, performedBy: 1 }),
    ]);

    const ledger1 = await ops.rawMaterialInventory.getTransactions({ rawMaterialId });
    expect(ledger1).toHaveLength(1);
    expect(ledger1[0]).toMatchObject({
      transactionType: "receive", quantity: "60.0000", previousQuantity: "0.0000", newQuantity: "60.0000",
      unit: "kg", referenceType: "purchase_order", referenceId: poId, lotNumber: "LOT-A", performedBy: 1, warehouseId: WAREHOUSE_MAIN,
    });

    // Cost layer at the PO unit price via the real costing service.
    expect(db.createInventoryCostLayer).toHaveBeenCalledTimes(1);
    const layers1 = state.inventoryCostLayers.filter((l) => l.productId === productId);
    expect(layers1).toHaveLength(1);
    expect(layers1[0]).toMatchObject({
      productId, warehouseId: WAREHOUSE_MAIN, purchaseOrderId: poId, referenceType: "purchase_order", referenceId: poId,
      originalQuantity: "60", remainingQuantity: "60", unitCost: "12.5000", totalCost: "750.00", currency: "USD", status: "active",
    });

    // Receiving is audited against the PO with the status change and what arrived.
    const receiptAudits = () => auditRows("purchaseOrder", "update").filter((a) => a.newValues?.receivingRecordId);
    expect(receiptAudits()).toHaveLength(1);
    expect(receiptAudits()[0]).toMatchObject({
      userId: 1, entityId: poId, entityName: poNumber,
      oldValues: { status: "confirmed" },
      newValues: { status: "partial", receivingRecordId: 1, warehouseId: WAREHOUSE_MAIN, items: [{ purchaseOrderItemId: poItemId, quantity: 60 }] },
    });

    // Second delivery: remaining 40 kg.
    const second = await ops.poReceiving.receive({
      purchaseOrderId: poId,
      warehouseId: WAREHOUSE_MAIN,
      items: [{ purchaseOrderItemId: poItemId, rawMaterialId, productId, quantity: 40, unit: "kg", lotNumber: "LOT-B" }],
    });
    expect(second).toEqual({ id: 2 });
    expect(state.purchaseOrders.get(poId)).toMatchObject({ status: "received" });
    expect(state.purchaseOrders.get(poId)!.receivedDate).toBeInstanceOf(Date);
    expect(state.purchaseOrderItems.get(poItemId)!.receivedQuantity).toBe("100.0000");
    expect((await ops.rawMaterialInventory.list({ rawMaterialId }))[0]).toMatchObject({ quantity: "100.0000", availableQuantity: "100.0000", lotNumber: "LOT-B" });
    expect(state.inventory.get(inventoryId)!.quantity).toBe("100");
    expect((await ops.inventory.getMovementHistory({ productId, type: "receive" })).map((t) => [t.transactionNumber, t.quantity])).toEqual([["TXN-2", "40"], ["TXN-1", "60"]]);

    const layers2 = state.inventoryCostLayers.filter((l) => l.productId === productId);
    expect(layers2.map((l) => [l.originalQuantity, l.remainingQuantity, l.unitCost, l.totalCost])).toEqual([
      ["60", "60", "12.5000", "750.00"],
      ["40", "40", "12.5000", "500.00"],
    ]);
    expect(receiptAudits()).toHaveLength(2);
    expect(receiptAudits()[1]).toMatchObject({ oldValues: { status: "partial" }, newValues: { status: "received", receivingRecordId: 2 } });

    // Receiving history the POReceiving page shows.
    const records = await ops.poReceiving.getRecords({ purchaseOrderId: poId });
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.warehouseId === WAREHOUSE_MAIN && r.receivedBy === 1)).toBe(true);
    expect(await ops.poReceiving.getItems({ receivingRecordId: 2 })).toEqual([
      expect.objectContaining({ purchaseOrderItemId: poItemId, rawMaterialId, productId, receivedQuantity: "40", unit: "kg", lotNumber: "LOT-B", condition: "good" }),
    ]);

    // Guards: only ops roles may receive, and a draft PO cannot be received.
    await expect(sales.poReceiving.receive({ purchaseOrderId: poId, warehouseId: WAREHOUSE_MAIN, items: [] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    const draft = await ops.purchaseOrders.create({
      vendorId, orderDate: new Date("2026-09-15T00:00:00Z"), subtotal: "125.00", totalAmount: "125.00",
      items: [{ productId, description: "Smoked Paprika", quantity: "10", unitPrice: "12.50", totalAmount: "125.00" }],
    });
    draftPoId = draft.id;
    const draftItemId = state.purchaseOrderItems.find((i) => i.purchaseOrderId === draftPoId)!.id;
    await expect(ops.poReceiving.receive({
      purchaseOrderId: draftPoId, warehouseId: WAREHOUSE_MAIN,
      items: [{ purchaseOrderItemId: draftItemId, rawMaterialId, productId, quantity: 10, unit: "kg" }],
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(ops.poReceiving.receive({ purchaseOrderId: 999, warehouseId: WAREHOUSE_MAIN, items: [] }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(state.poReceivingRecords.all()).toHaveLength(2);
    expect((await ops.rawMaterialInventory.list({ rawMaterialId }))[0].quantity).toBe("100.0000");

    // A fully received PO cannot be re-sent to the supplier (it used to get a fresh portal session).
    await expect(ops.purchaseOrders.sendToSupplier({ poId })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("is received") });
    expect(state.supplierPortalSessions.all()).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  it("5. allocating freight and duties raises the unit cost of the existing layers without adding quantity", async () => {
    const before = state.inventoryCostLayers.filter((l) => l.productId === productId).map((l) => ({ ...l }));
    expect(before).toHaveLength(2);

    const result = await ops.cogs.allocateFreight({ purchaseOrderId: poId, totalFreightCost: 150, totalCustomsDuties: 50 });
    expect(result).toEqual({ success: true, totalLandedCost: 200, productsAllocated: 1, layersAdjusted: 2 });

    // $200 over 100 kg on hand = +$2.00/kg on every active layer; quantities untouched, no new layer.
    expect(db.createInventoryCostLayer).toHaveBeenCalledTimes(2);
    expect(db.updateInventoryCostLayer).toHaveBeenCalledTimes(2);
    const after = state.inventoryCostLayers.filter((l) => l.productId === productId);
    expect(after).toHaveLength(2);
    expect(after.map((l) => [l.originalQuantity, l.remainingQuantity, l.unitCost, l.totalCost])).toEqual([
      ["60", "60", "14.5000", "870.00"],
      ["40", "40", "14.5000", "580.00"],
    ]);
    expect(after.map((l) => l.id)).toEqual(before.map((l) => l.id));
    expect((await ops.rawMaterialInventory.list({ rawMaterialId }))[0].quantity).toBe("100.0000");

    expect(auditRows("freight_allocation", "create")).toEqual([
      expect.objectContaining({ userId: 1, entityId: poId, entityName: "Allocated $200.00 landed cost across 1 product(s), 2 cost layer(s)" }),
    ]);
  });

  // -------------------------------------------------------------------------
  it("6. a blind cycle count, approved by an admin, corrects book stock and posts a reason-coded ledger row", async () => {
    // The two receipts in step 4 booked the 100 kg on the product record, so
    // the count has book stock to check without a manual adjustment.
    expect(state.inventory.get(inventoryId)!.quantity).toBe("100");
    // At 100 on hand the reorder point (40) is not breached: no alert, nothing to order.
    expect(db.notifyUsersOfEvent).not.toHaveBeenCalled();
    expect(await ops.inventory.replenishmentPlan({ onlyActionable: true })).toEqual([]);

    const count = await ops.cycleCounts.create({ warehouseId: WAREHOUSE_MAIN, countType: "cycle", blindCount: true, notes: "Spice shelf" });
    countId = count.id;
    expect(count.countNumber).toBe("CC-0001");
    expect(auditRows("cycleCount", "create")).toEqual([expect.objectContaining({ userId: 1, entityId: countId, entityName: "CC-0001" })]);

    expect(await ops.cycleCounts.generateLines({ countId, productIds: [productId] })).toEqual({ countId, linesGenerated: 1 });
    const draftView = await ops.cycleCounts.getById({ id: countId });
    expect(draftView!.status).toBe("draft");
    expect(draftView!.lines).toHaveLength(1);
    countLineId = draftView!.lines[0].id;
    // Blind count: the counter does not see the book quantity while it is open.
    expect(draftView!.lines[0].systemQuantity).toBeNull();
    expect(state.cycleCountLines.get(countLineId)!.systemQuantity).toBe("100");

    // Cannot record before the count starts.
    await expect(ops.cycleCounts.recordLine({ lineId: countLineId, countedQuantity: 92 })).rejects.toThrow(/only be recorded while the count is open/);
    expect(await ops.cycleCounts.start({ id: countId })).toEqual({ success: true, lineCount: 1 });

    const recorded = await ops.cycleCounts.recordLine({ lineId: countLineId, countedQuantity: 92, reasonCode: "shrinkage", notes: "8 kg unaccounted for" });
    expect(recorded).toEqual({ id: countLineId, systemQuantity: 100, countedQuantity: 92, variance: -8 });
    expect(state.cycleCountLines.get(countLineId)).toMatchObject({ status: "counted", variance: "-8", reasonCode: "shrinkage", countedBy: 1 });

    expect(await ops.cycleCounts.submitForReview({ id: countId })).toEqual({ success: true });
    const review = await ops.cycleCounts.getById({ id: countId });
    expect(review!.status).toBe("pending_review");
    expect(review!.lines[0].systemQuantity).toBe("100"); // revealed once closed
    expect(review!.summary).toMatchObject({ totalLines: 1, countedLines: 1, linesWithVariance: 1, accuracyPercent: 0 });

    // Segregation of duties: the counter (ops) cannot approve their own variance.
    await expect(ops.cycleCounts.approve({ id: countId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.inventory.get(inventoryId)!.quantity).toBe("100");

    const approved = await admin.cycleCounts.approve({ id: countId });
    expect(approved).toMatchObject({ success: true, countNumber: "CC-0001", linesApproved: 1, adjustmentsPosted: 1, adjustmentsFailed: 0 });
    expect(approved.posted).toEqual([{ lineId: countLineId, variance: -8, transactionNumber: "TXN-3" }]);

    // Book stock corrected and stamped with the count.
    expect(state.inventory.get(inventoryId)).toMatchObject({ quantity: "92", lastCountQuantity: "92" });
    expect(state.inventory.get(inventoryId)!.lastCountDate).toBeInstanceOf(Date);
    expect(state.cycleCounts.get(countId)).toMatchObject({ status: "approved", approvedBy: 3 });

    // Ledger row carries the reason code and references the count.
    const movements = await ops.inventory.getMovementHistory({ productId, type: "count_adjust" });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      transactionNumber: "TXN-3", transactionType: "count_adjust", productId, fromWarehouseId: WAREHOUSE_MAIN, toWarehouseId: null,
      quantity: "8", previousBalance: "100", newBalance: "92", reasonCode: "shrinkage",
      reason: "Cycle count CC-0001: system 100, counted 92", referenceType: "cycle_count", referenceId: countId, performedBy: 3,
    });
    expect(auditRows("cycleCount", "approve")).toEqual([expect.objectContaining({ userId: 3, entityId: countId, entityName: "CC-0001" })]);
  });

  // -------------------------------------------------------------------------
  it("7. an adjustment that drops stock below the reorder point raises a low-stock alert and puts the item on the replenishment plan", async () => {
    const adjusted = await ops.inventory.adjust({
      productId, warehouseId: WAREHOUSE_MAIN, quantityDelta: -60, reasonCode: "damage", reason: "Water damage in bay 3",
    });
    expect(adjusted).toMatchObject({ previousQuantity: 92, newQuantity: 32, transactionNumber: "TXN-4" });
    expect(state.inventory.get(inventoryId)!.quantity).toBe("32");
    expect(state.inventoryTransactions.get(4)).toMatchObject({ transactionType: "adjust", reasonCode: "damage", reason: "Water damage in bay 3", quantity: "60", performedBy: 1 });
    expect(auditRows("inventory", "update").at(-1)).toMatchObject({
      entityId: productId, entityName: "TXN-4", oldValues: { quantity: 92 }, newValues: { quantity: 32, reasonCode: "damage" },
    });

    // 32 on hand <= reorder level 40 → every ops/admin/exec user is alerted.
    expect(db.notifyUsersOfEvent).toHaveBeenCalledTimes(1);
    expect(state.notifications[0].userIds).toEqual([1, 2, 3]);
    expect(state.notifications[0].event).toMatchObject({
      type: "inventory_low", severity: "warning", entityType: "inventory", entityId: inventoryId, link: "/operations/inventory",
      title: "Low Stock Alert: Smoked Paprika",
      metadata: { productId, warehouseId: WAREHOUSE_MAIN, quantity: 32, reorderLevel: 40 },
    });

    const plan = await ops.inventory.replenishmentPlan({ onlyActionable: true });
    expect(db.getReplenishmentPlan).toHaveBeenLastCalledWith({ windowDays: 90, onlyActionable: true });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      productId, warehouseId: WAREHOUSE_MAIN, sku: "RM-PAP-01", productName: "Smoked Paprika",
      onHand: 32, reorderLevel: 40, shouldOrder: true, suggestedQuantity: 100,
      preferredVendorId: vendorId, vendorName: "Sunrise Spice Co",
    });

    // Negative stock is refused before anything is written.
    await expect(ops.inventory.adjust({ productId, warehouseId: WAREHOUSE_MAIN, quantityDelta: -33, reasonCode: "damage" })).rejects.toThrow(/negative/);
    expect(state.inventory.get(inventoryId)!.quantity).toBe("32");
    expect(state.inventoryTransactions.all()).toHaveLength(4);
  });

  // -------------------------------------------------------------------------
  it("8. an ops user of another entity cannot see the vendor or PO, and a sales user cannot raise a PO", async () => {
    // Other entity: scope resolves to { entity, [2] }; everything here belongs to company 1.
    expect(await otherEntityOps.vendors.get({ id: vendorId })).toBeUndefined();
    expect(db.getVendorById).toHaveBeenLastCalledWith(vendorId, { mode: "entity", companyIds: [2] });
    expect(await otherEntityOps.vendors.list()).toEqual([]);
    expect(await otherEntityOps.purchaseOrders.listPaged({ limit: 50 })).toEqual({ rows: [], total: 0 });
    expect(await otherEntityOps.purchaseOrders.get({ id: poId })).toBeUndefined();
    expect(await otherEntityOps.inventory.list()).toEqual([]);
    // Creating under someone else's entity is refused outright.
    await expect(otherEntityOps.vendors.create({ name: "Intruder Ltd", companyId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Home entity still sees everything.
    expect((await ops.purchaseOrders.listPaged({ limit: 50 })).total).toBe(2);
    expect((await ops.purchaseOrders.get({ id: poId }))?.poNumber).toBe(poNumber);
    expect((await ops.inventory.list()).map((r) => r.id)).toEqual([inventoryId]);

    // Sales is not an operations role.
    await expect(sales.purchaseOrders.create({
      vendorId, orderDate: new Date(), subtotal: "1", totalAmount: "1",
      items: [{ description: "x", quantity: "1", unitPrice: "1", totalAmount: "1" }],
    })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Operations access required" });
    await expect(sales.purchaseOrders.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sales.vendors.create({ name: "Nope" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sales.cycleCounts.create({ warehouseId: WAREHOUSE_MAIN })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.purchaseOrders.all()).toHaveLength(2);
    expect(state.vendors.all()).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  it("9. a PO created from text links its line to the raw material through the junction — never a raw-material id in productId", async () => {
    const preview = {
      vendorId, vendorName: "Sunrise Spice Co", rawMaterialId,
      items: [{ description: "Smoked Paprika (30 kg)", quantity: "30", unitPrice: "12.50", totalAmount: "375.00", rawMaterialId }],
      shippingAddress: "", notes: "From text", subtotal: "375.00", totalAmount: "375.00", suggested: false, isPriceEstimated: false,
    };
    const created = await ops.purchaseOrders.createFromText({ text: "order 30 kg of smoked paprika", preview });
    expect(created).toMatchObject({ success: true, emailSent: false });
    const po = state.purchaseOrders.get(created.po.id)!;
    expect(po).toMatchObject({ vendorId, status: "draft", subtotal: "375.00", totalAmount: "375.00", notes: "From text", createdBy: 1 });
    expect(po.poNumber).toMatch(/^PO-\d{4}-\d{4}$/);

    // textToPOService used to write the rawMaterials id into purchaseOrderItems.productId (an FK to products).
    const item = state.purchaseOrderItems.find((i) => i.purchaseOrderId === po.id)!;
    expect(item).toMatchObject({ description: "Smoked Paprika (30 kg)", quantity: "30", unitPrice: "12.50", totalAmount: "375.00", productId: null });
    expect(state.purchaseOrderRawMaterials.filter((l) => l.purchaseOrderItemId === item.id)).toEqual([
      expect.objectContaining({ rawMaterialId, orderedQuantity: "30", receivedQuantity: "0", unit: "kg", status: "ordered" }),
    ]);
    // The line resolves to its material the way the PO screen and receiving read it.
    expect((await ops.purchaseOrders.get({ id: po.id }))!.items[0].rawMaterial).toMatchObject({ id: rawMaterialId, name: "Smoked Paprika", unit: "kg" });
    expect(auditRows("purchaseOrder", "create").at(-1)).toMatchObject({ entityId: po.id, entityName: po.poNumber });
  });
});
