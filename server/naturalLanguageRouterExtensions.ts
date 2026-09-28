/**
 * Natural Language Router Extensions
 * Adds createFromText endpoints for all major entities
 */

import { z } from 'zod';
import { protectedProcedure } from './_core/trpc';
import { parseEntityText, findOrCreateEntity } from './_core/universalTextParser';
import * as db from './db';
import { TRPCError } from '@trpc/server';

// Role-based procedures (defined locally to avoid circular dependency with routers.ts)
const opsProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'ops', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Operations access required' });
  }
  return next({ ctx });
});

const financeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['admin', 'finance', 'exec'].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Finance access required' });
  }
  return next({ ctx });
});

/**
 * Case-insensitive product lookup by name or SKU. Products are never created
 * from free text here — a transfer of an unknown item is rejected instead.
 */
async function findProductByNameOrSku(nameOrSku: string) {
  const needle = nameOrSku.trim().toLowerCase();
  if (!needle) return undefined;
  const bySku = await db.getProductBySku(nameOrSku.trim());
  if (bySku) return bySku;
  const products = await db.getProducts();
  return products.find(p => p.name?.toLowerCase() === needle || p.sku?.toLowerCase() === needle);
}

function generateNumber(prefix: string) {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${year}${month}-${random}`;
}

type CoreAuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'view'
  | 'export'
  | 'approve'
  | 'reject';

type ExtendedAuditAction = CoreAuditAction | 'warning' | 'error' | 'bulk_update';

function normalizeAuditAction(action: ExtendedAuditAction): CoreAuditAction {
  switch (action) {
    case 'bulk_update':
    case 'warning':
    case 'error':
      return 'update';
    default:
      return action;
  }
}

async function createAuditLog(userId: number, action: ExtendedAuditAction, entityType: string, entityId: number, entityName?: string, oldValues?: any, newValues?: any) {
  await db.createAuditLog({
    userId, action: normalizeAuditAction(action), entityType, entityId, entityName, oldValues, newValues,
  });
}

// ============================================
// PURCHASE ORDERS
// ============================================

export const purchaseOrderTextEndpoints = {
  createFromText: opsProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Parse the text using AI
        const parsed = await parseEntityText(input.text, 'purchase_order');
        
        // Find or create vendor
        const vendorId = await findOrCreateEntity(parsed.vendorName, 'vendor', db);
        
        // Calculate dates
        const orderDate = new Date();
        const expectedDate = parsed.deliveryDate ? new Date(parsed.deliveryDate) : undefined;
        
        // Calculate totals
        let subtotal = 0;
        const items = [];
        
        for (const item of parsed.items || []) {
          const quantity = Number(item.quantity) || 1;
          const unitPrice = item.unitPrice ? Number(item.unitPrice) : 0;
          const total = quantity * unitPrice;
          subtotal += total;
          
          // Find or create the raw material. Its id is a rawMaterials id, which
          // must NOT be written to purchaseOrderItems.productId (FK to products);
          // the line is linked through purchaseOrderRawMaterials instead.
          let rawMaterialId: number | undefined;
          let rawMaterialUnit: string | undefined;
          try {
            const existing = await db.getRawMaterialByNameOrSku(item.materialName, item.materialName);
            rawMaterialId = existing?.id ?? await findOrCreateEntity(item.materialName, 'material', db);
            rawMaterialUnit = existing?.unit ?? (await db.getRawMaterialById(rawMaterialId))?.unit;
          } catch (err) {
            // Log material linking failure to audit trail
            console.warn('Failed to link material:', err);
            await createAuditLog(ctx.user.id, 'create', 'purchaseOrder', 0, 'Material linking failed', null, {
              materialName: item.materialName,
              error: err instanceof Error ? err.message : 'Unknown error'
            });
          }
          
          items.push({
            rawMaterialId,
            unit: item.unit || rawMaterialUnit || 'EA',
            description: `${item.quantity} ${item.unit || 'units'} ${item.materialName}`,
            quantity: quantity.toString(),
            unitPrice: unitPrice.toFixed(2),
            totalAmount: total.toFixed(2),
          });
        }
        
        const totalAmount = parsed.totalAmount || subtotal;
        
        // Create draft PO
        const poNumber = generateNumber('PO');
        const po = await db.createPurchaseOrder({
          vendorId,
          poNumber,
          orderDate,
          expectedDate,
          status: 'draft',
          subtotal: subtotal.toFixed(2),
          taxAmount: '0.00',
          shippingAmount: '0.00',
          totalAmount: totalAmount.toFixed(2),
          currency: 'USD',
          notes: parsed.notes || undefined,
          createdBy: ctx.user.id,
        });
        
        // Create PO line items and link each to its raw material (same
        // pattern as server/routers/purchaseOrders.ts)
        for (const { rawMaterialId, unit, ...line } of items) {
          const poItem = await db.createPurchaseOrderItem({
            purchaseOrderId: po.id,
            ...line,
          });
          if (rawMaterialId) {
            await db.createPurchaseOrderRawMaterialLink({
              purchaseOrderItemId: poItem.id,
              rawMaterialId,
              orderedQuantity: line.quantity,
              unit,
            });
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'purchaseOrder', po.id, poNumber, null, { source: 'text', originalText: input.text });
        
        return {
          poId: po.id,
          poNumber,
          parsed,
        };
      } catch (error) {
        console.error('[PO createFromText] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create purchase order from text'
        });
      }
    }),
};

// ============================================
// SHIPMENTS
// ============================================

export const shipmentTextEndpoints = {
  createFromText: opsProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Parse the text using AI
        const parsed = await parseEntityText(input.text, 'shipment');
        
        // Create shipment
        const shipmentNumber = generateNumber('SHIP');
        const shipment = await db.createShipment({
          shipmentNumber,
          type: 'inbound', // Default to inbound
          carrier: parsed.carrier,
          trackingNumber: parsed.trackingNumber,
          status: parsed.status || 'pending',
          fromAddress: parsed.origin || undefined,
          toAddress: parsed.destination || undefined,
          deliveryDate: parsed.estimatedDelivery ? new Date(parsed.estimatedDelivery) : undefined,
          weight: parsed.weight ? parsed.weight.toString() : undefined,
          notes: parsed.notes || undefined,
        } as any);
        
        await createAuditLog(ctx.user.id, 'create', 'shipment', shipment.id, shipmentNumber, null, { source: 'text', originalText: input.text });
        
        return {
          shipmentId: shipment.id,
          shipmentNumber,
          trackingNumber: parsed.trackingNumber,
          parsed,
        };
      } catch (error) {
        console.error('[Shipment createFromText] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create shipment from text'
        });
      }
    }),
};

// ============================================
// PAYMENTS
// ============================================

export const paymentTextEndpoints = {
  createFromText: financeProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Parse the text using AI
        const parsed = await parseEntityText(input.text, 'payment');
        
        // Find customer/vendor (try both)
        let customerId: number | undefined;
        let vendorId: number | undefined;
        
        try {
          customerId = await findOrCreateEntity(parsed.payerName, 'customer', db);
        } catch (err) {
          // Try as vendor if customer fails
          try {
            vendorId = await findOrCreateEntity(parsed.payerName, 'vendor', db);
          } catch (vendorErr) {
            // Both lookups failed - this is a critical issue
            console.error('Failed to find/create payer entity:', { customerError: err, vendorError: vendorErr });
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Unable to identify payer "${parsed.payerName}". Please create the customer or vendor first.`
            });
          }
        }
        
        // Log warning if payment has no associated entity (shouldn't happen after above check)
        if (!customerId && !vendorId) {
          console.error('CRITICAL: Payment created with no associated entity');
          await createAuditLog(ctx.user.id, 'create', 'payment', 0, 'Payment without entity', null, {
            payerName: parsed.payerName,
            amount: parsed.amount
          });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to associate payment with customer or vendor'
          });
        }
        
        // Find invoice if mentioned
        let invoiceId: number | undefined;
        if (parsed.invoiceNumber) {
          // invoiceNumber may be a string like "INV-2024-001" or a numeric ID
          const invoiceNumStr = String(parsed.invoiceNumber);
          const numericId = parseInt(invoiceNumStr, 10);
          const invoice = (!isNaN(numericId) && String(numericId) === invoiceNumStr)
            ? await db.getInvoiceById(numericId)
            : await db.getInvoiceByNumber(invoiceNumStr);
          if (invoice) {
            invoiceId = invoice.id;
          }
        }
        
        // Create payment record
        const payment = await db.createPayment({
          invoiceId,
          customerId,
          vendorId,
          paymentNumber: generateNumber('PAY'),
          type: customerId ? 'received' as const : 'made' as const,
          amount: parsed.amount.toFixed(2),
          paymentDate: parsed.paymentDate ? new Date(parsed.paymentDate) : new Date(),
          paymentMethod: parsed.paymentMethod || 'bank_transfer',
          referenceNumber: parsed.referenceNumber || undefined,
          currency: parsed.currency || 'USD',
          notes: parsed.notes || undefined,
          status: 'completed',
        } as any);
        
        // Update invoice if linked
        if (invoiceId) {
          const invoice = await db.getInvoiceById(invoiceId);
          if (invoice) {
            const currentPaid = parseFloat(invoice.paidAmount || '0');
            const newPaid = currentPaid + parsed.amount;
            const total = parseFloat(invoice.totalAmount);
            const newStatus = newPaid >= total ? 'paid' : 'partial';
            
            await db.updateInvoice(invoiceId, {
              paidAmount: newPaid.toFixed(2),
              status: newStatus,
            });
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'payment', payment.id, parsed.referenceNumber, null, { source: 'text', originalText: input.text });
        
        return {
          paymentId: payment.id,
          amount: parsed.amount,
          parsed,
        };
      } catch (error) {
        console.error('[Payment createFromText] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to record payment from text'
        });
      }
    }),
};

// ============================================
// WORK ORDERS
// ============================================

export const workOrderTextEndpoints = {
  createFromText: opsProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Parse the text using AI
        const parsed = await parseEntityText(input.text, 'work_order');
        
        // Find or create product
        let productId: number | undefined;
        try {
          productId = await findOrCreateEntity(parsed.productName, 'product', db);
        } catch (err) {
          console.warn('Failed to find/create product:', err);
        }
        
        // Create work order
        const workOrder = await db.createWorkOrder({
          productId,
          quantity: parsed.quantity.toString(),
          unit: parsed.unit || 'EA',
          status: 'draft',
          priority: parsed.priority === 'medium' ? 'normal' : (parsed.priority || 'normal'),
          scheduledEndDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
          notes: parsed.notes || undefined,
          createdBy: ctx.user.id,
          bomId: 0,
        } as any);
        
        await createAuditLog(ctx.user.id, 'create', 'workOrder', workOrder.id, workOrder.workOrderNumber, null, { source: 'text', originalText: input.text });

        return {
          workOrderId: workOrder.id,
          workOrderNumber: workOrder.workOrderNumber,
          parsed,
        };
      } catch (error) {
        console.error('[WorkOrder createFromText] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create work order from text'
        });
      }
    }),
};

// ============================================
// INVENTORY TRANSFERS
// ============================================

export const inventoryTextEndpoints = {
  transferFromText: opsProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Parse the text using AI
        const parsed = await parseEntityText(input.text, 'inventory_transfer');
        
        // Find warehouses
        const fromWarehouse = await db.getWarehouses().then(ws => ws.find(w => w.name === parsed.fromLocation) ?? null);
        const toWarehouse = await db.getWarehouses().then(ws => ws.find(w => w.name === parsed.toLocation) ?? null);
        
        if (!fromWarehouse || !toWarehouse) {
          throw new Error(`Warehouse not found: ${!fromWarehouse ? parsed.fromLocation : parsed.toLocation}`);
        }
        
        // Resolve every product up front so an unknown/raw-material line fails
        // before any transfer row is written.
        const resolvedItems: Array<{ productId: number; quantity: string }> = [];
        for (const item of parsed.items || []) {
          const product = await findProductByNameOrSku(item.materialName);
          if (!product) {
            const rawMaterial = await db.getRawMaterialByNameOrSku(item.materialName, item.materialName);
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: rawMaterial
                ? `"${item.materialName}" is a raw material; inventory transfers move finished products only`
                : `No product found matching "${item.materialName}"`,
            });
          }
          resolvedItems.push({ productId: product.id, quantity: item.quantity.toString() });
        }

        // Create inventory transfer
        const transfer = await db.createTransfer({
          fromWarehouseId: fromWarehouse.id,
          toWarehouseId: toWarehouse.id,
          requestedDate: parsed.transferDate ? new Date(parsed.transferDate) : new Date(),
          status: 'pending',
          notes: parsed.notes || parsed.reason || undefined,
          requestedBy: ctx.user.id,
        });


        // Create transfer items (inventoryTransferItems.productId -> products)
        for (const item of resolvedItems) {
          await db.addTransferItem({
            transferId: transfer.id,
            productId: item.productId,
            requestedQuantity: item.quantity,
          });
        }

        await createAuditLog(ctx.user.id, 'create', 'inventoryTransfer', transfer.id, transfer.transferNumber, null, { source: 'text', originalText: input.text });

        return {
          transferId: transfer.id,
          transferNumber: transfer.transferNumber,
          parsed,
        };
      } catch (error) {
        // Keep the BAD_REQUEST raised for unresolved products/raw materials
        if (error instanceof TRPCError) throw error;
        console.error('[InventoryTransfer createFromText] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create inventory transfer from text'
        });
      }
    }),
};
