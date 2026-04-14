import { z } from "zod";
import * as db from "../db";
import { router, protectedProcedure, opsProcedure, createAuditLog, generateNumber } from "./middleware";

export const operationsRouter = router({
  // ============================================
  // PRODUCT MANAGEMENT
  // ============================================
  products: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getProducts(input?.companyId)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getProductById(input.id)),
    create: opsProcedure
      .input(z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        companyId: z.number().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        type: z.enum(['physical', 'digital', 'service']).optional(),
        manufacturingStage: z.enum(['raw_material', 'semi_finished_good', 'finished_product']).optional(),
        unitPrice: z.string(),
        costPrice: z.string().optional(),
        currency: z.string().optional(),
        taxable: z.boolean().optional(),
        taxRate: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createProduct(input);
        await createAuditLog(ctx.user.id, 'create', 'product', result.id, input.name);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        type: z.enum(['physical', 'digital', 'service']).optional(),
        manufacturingStage: z.enum(['raw_material', 'semi_finished_good', 'finished_product']).optional(),
        unitPrice: z.string().optional(),
        costPrice: z.string().optional(),
        status: z.enum(['active', 'inactive', 'discontinued']).optional(),
        taxable: z.boolean().optional(),
        taxRate: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProduct(id, data);
        await createAuditLog(ctx.user.id, 'update', 'product', id);
        return { success: true };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteProduct(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'product', input.id);
        return { success: true };
      }),
  }),
  // ============================================
  // OPERATIONS - INVENTORY
  // ============================================
  inventory: router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        warehouseId: z.number().optional(),
        productId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getInventory(input)),
    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        productId: z.number(),
        warehouseId: z.number().optional(),
        quantity: z.string(),
        reorderLevel: z.string().optional(),
        reorderQuantity: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createInventory(input);
        await createAuditLog(ctx.user.id, 'create', 'inventory', result.id);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        quantity: z.string().optional(),
        reservedQuantity: z.string().optional(),
        reorderLevel: z.string().optional(),
        reorderQuantity: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const [oldInventory] = await db.getInventory({ id } as any) || [];
        await db.updateInventory(id, data);
        await createAuditLog(ctx.user.id, 'update', 'inventory', id);

        // Check for low stock and create notification
        if (data.quantity && oldInventory) {
          const newQty = parseFloat(data.quantity);
          const reorderLevel = parseFloat(oldInventory.reorderLevel || '0');

          if (newQty <= reorderLevel && newQty > 0) {
            const allUsers = await db.getAllUsers();
            const opsUsers = allUsers.filter(u => ['admin', 'ops', 'exec'].includes(u.role));
            const product = await db.getProductById(oldInventory.productId);

            await db.notifyUsersOfEvent({
              type: 'inventory_low',
              title: `Low Stock Alert: ${product?.name || 'Product'}`,
              message: `Inventory for ${product?.name} is at ${newQty} units, below reorder level of ${reorderLevel}`,
              entityType: 'inventory',
              entityId: id,
              severity: 'warning',
              link: `/operations/inventory`,
              metadata: { productId: oldInventory.productId, quantity: newQty, reorderLevel },
            }, opsUsers.map(u => u.id));
          }
        }

        return { success: true };
      }),
    bulkUpdate: opsProcedure
      .input(z.object({
        ids: z.array(z.number()),
        action: z.enum(['adjust_quantity', 'change_location', 'update_reorder_point']),
        quantityAdjustment: z.number().optional(),
        warehouseId: z.number().optional(),
        reorderLevel: z.string().optional(),
        reorderQuantity: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { ids, action, ...data } = input;

        // Build the update data based on action
        const updateData: {
          quantityAdjustment?: number;
          warehouseId?: number;
          reorderLevel?: string;
          reorderQuantity?: string;
        } = {};

        switch (action) {
          case 'adjust_quantity':
            if (data.quantityAdjustment !== undefined) {
              updateData.quantityAdjustment = data.quantityAdjustment;
            }
            break;
          case 'change_location':
            if (data.warehouseId !== undefined) {
              updateData.warehouseId = data.warehouseId;
            }
            break;
          case 'update_reorder_point':
            if (data.reorderLevel !== undefined) {
              updateData.reorderLevel = data.reorderLevel;
            }
            if (data.reorderQuantity !== undefined) {
              updateData.reorderQuantity = data.reorderQuantity;
            }
            break;
        }

        const results = await db.bulkUpdateInventory(ids, updateData);

        // Create audit logs for each updated item
        for (const result of results.filter(r => r.success)) {
          await createAuditLog(ctx.user.id, 'update' as any, 'inventory', result.id);
        }

        // Check for low stock alerts on quantity adjustments
        if (action === 'adjust_quantity' && data.quantityAdjustment !== undefined) {
          const updatedItems = await db.getInventoryByIds(ids);
          const allUsers = await db.getAllUsers();
          const opsUsers = allUsers.filter(u => ['admin', 'ops', 'exec'].includes(u.role));

          for (const item of updatedItems) {
            const qty = parseFloat(item.quantity || '0');
            const reorderLevel = parseFloat(item.reorderLevel || '0');

            if (qty <= reorderLevel && qty > 0) {
              const product = await db.getProductById(item.productId);
              await db.notifyUsersOfEvent({
                type: 'inventory_low',
                title: `Low Stock Alert: ${product?.name || 'Product'}`,
                message: `Inventory for ${product?.name} is at ${qty} units, below reorder level of ${reorderLevel}`,
                entityType: 'inventory',
                entityId: item.id,
                severity: 'warning',
                link: `/operations/inventory`,
                metadata: { productId: item.productId, quantity: qty, reorderLevel },
              }, opsUsers.map(u => u.id));
            }
          }
        }

        return {
          success: true,
          results,
          totalUpdated: results.filter(r => r.success).length,
          totalFailed: results.filter(r => !r.success).length,
        };
      }),
    // Get pending inventory from POs (on order or in transit)
    getPendingFromPOs: opsProcedure
      .query(() => db.getPendingInventoryFromPOs()),
    // Get inbound shipments from POs
    getInboundShipments: opsProcedure
      .query(() => db.getInboundShipmentsFromPOs()),
  }),
  // ============================================
  // OPERATIONS - WAREHOUSES
  // ============================================
  warehouses: router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getWarehouses(input)),
    getById: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getWarehouseById(input.id)),
    create: opsProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        code: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        type: z.enum(['warehouse', 'store', 'distribution', 'copacker', '3pl']).optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        isPrimary: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createWarehouse(input);
        await createAuditLog(ctx.user.id, 'create', 'warehouse', result.id, input.name);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        code: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        type: z.enum(['warehouse', 'store', 'distribution', 'copacker', '3pl']).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        isPrimary: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateWarehouse(id, data);
        await createAuditLog(ctx.user.id, 'update', 'warehouse', id, `Updated warehouse ${id}`);
        return { success: true };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteWarehouse(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'warehouse', input.id, `Deleted warehouse ${input.id}`);
        return { success: true };
      }),
    summary: opsProcedure.query(() => db.getLocationInventorySummary()),
  }),
  // ============================================
  // INVENTORY TRANSFERS
  // ============================================
  transfers: router({
    list: opsProcedure
      .input(z.object({
        status: z.string().optional(),
        fromWarehouseId: z.number().optional(),
        toWarehouseId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getInventoryTransfers(input)),
    getById: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const transfer = await db.getTransferById(input.id);
        const items = await db.getTransferItems(input.id);
        return { transfer, items };
      }),
    create: opsProcedure
      .input(z.object({
        fromWarehouseId: z.number(),
        toWarehouseId: z.number(),
        requestedDate: z.date(),
        expectedArrival: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createTransfer({
          ...input,
          requestedBy: ctx.user.id,
        });
        await createAuditLog(ctx.user.id, 'create', 'transfer', result.id, result.transferNumber);
        return result;
      }),
    addItem: opsProcedure
      .input(z.object({
        transferId: z.number(),
        productId: z.number(),
        requestedQuantity: z.string(),
        lotNumber: z.string().optional(),
        expirationDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return db.addTransferItem(input);
      }),
    ship: opsProcedure
      .input(z.object({
        id: z.number(),
        trackingNumber: z.string().optional(),
        carrier: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.trackingNumber || input.carrier) {
          await db.updateTransfer(input.id, {
            trackingNumber: input.trackingNumber,
            carrier: input.carrier,
          });
        }
        await db.processTransferShipment(input.id);
        await createAuditLog(ctx.user.id, 'update', 'transfer', input.id, 'Shipped transfer');
        return { success: true };
      }),
    receive: opsProcedure
      .input(z.object({
        id: z.number(),
        items: z.array(z.object({
          itemId: z.number(),
          receivedQuantity: z.number(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.processTransferReceipt(input.id, input.items);
        await createAuditLog(ctx.user.id, 'update', 'transfer', input.id, 'Received transfer');
        return { success: true };
      }),
    cancel: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateTransfer(input.id, { status: 'cancelled' });
        await createAuditLog(ctx.user.id, 'update', 'transfer', input.id, 'Cancelled transfer');
        return { success: true };
      }),
  }),
  // ============================================
  // OPERATIONS - PRODUCTION BATCHES
  // ============================================
  productionBatches: router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        productId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getProductionBatches(input)),
    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        productId: z.number(),
        quantity: z.string(),
        status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']).optional(),
        startDate: z.date().optional(),
        completionDate: z.date().optional(),
        warehouseId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const batchNumber = generateNumber('BATCH');
        const result = await db.createProductionBatch({ ...input, batchNumber, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'productionBatch', result.id, batchNumber);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']).optional(),
        completionDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProductionBatch(id, data);
        await createAuditLog(ctx.user.id, 'update', 'productionBatch', id);
        return { success: true };
      }),
  }),
  // ============================================
  // INVENTORY LOTS
  // ============================================
  inventoryLots: router({
    list: protectedProcedure
      .input(z.object({
        productId: z.number().optional(),
        status: z.enum(['active', 'hold', 'expired', 'depleted']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getInventoryLots(input);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getInventoryLotById(input.id);
      }),
    getBalances: protectedProcedure
      .input(z.object({
        lotId: z.number().optional(),
        productId: z.number().optional(),
        warehouseId: z.number().optional(),
        status: z.enum(['available', 'reserved', 'hold', 'damaged']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getInventoryBalances(input);
      }),
    getTransactionHistory: protectedProcedure
      .input(z.object({
        productId: z.number().optional(),
        lotId: z.number().optional(),
        warehouseId: z.number().optional(),
        type: z.string().optional(),
        limit: z.number().default(100),
      }))
      .query(async ({ input }) => {
        return db.getInventoryTransactionHistory(input, input.limit);
      }),
    reserve: protectedProcedure
      .input(z.object({
        lotId: z.number(),
        productId: z.number(),
        warehouseId: z.number(),
        quantity: z.number(),
        referenceType: z.string(),
        referenceId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.reserveInventory(
          input.lotId,
          input.productId,
          input.warehouseId,
          input.quantity,
          input.referenceType,
          input.referenceId,
          ctx.user?.id
        );
      }),
    release: protectedProcedure
      .input(z.object({
        lotId: z.number(),
        productId: z.number(),
        warehouseId: z.number(),
        quantity: z.number(),
        referenceType: z.string(),
        referenceId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.releaseReservation(
          input.lotId,
          input.productId,
          input.warehouseId,
          input.quantity,
          input.referenceType,
          input.referenceId,
          ctx.user?.id
        );
      }),
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['active', 'expired', 'consumed', 'quarantine']),
      }))
      .mutation(async ({ input }) => {
        await db.updateInventoryLot(input.id, { status: input.status });
        return { success: true };
      }),
    getAvailableByProduct: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input }) => {
        return db.getAvailableInventoryByProduct(input.productId);
      }),
  }),
});
