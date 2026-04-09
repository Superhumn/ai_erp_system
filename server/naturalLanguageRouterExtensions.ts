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
          
          // Find or create material
          let productId: number | undefined;
          try {
            productId = await findOrCreateEntity(item.materialName, 'material', db);
          } catch (err) {
            // Log material linking failure to audit trail
            console.warn('Failed to link material:', err);
            await createAuditLog(ctx.user.id, 'create', 'purchaseOrder', 0, 'Material linking failed', null, {
              materialName: item.materialName,
              error: err instanceof Error ? err.message : 'Unknown error'
            });
          }
          
          items.push({
            productId,
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
        
        // Create PO line items
        for (const item of items) {
          await db.createPurchaseOrderItem({
            purchaseOrderId: po.id,
            ...item,
          });
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
        
        // Create inventory transfer
        const transfer = await db.createTransfer({
          fromWarehouseId: fromWarehouse.id,
          toWarehouseId: toWarehouse.id,
          requestedDate: parsed.transferDate ? new Date(parsed.transferDate) : new Date(),
          status: 'pending',
          notes: parsed.notes || parsed.reason || undefined,
          requestedBy: ctx.user.id,
        });


        // Create transfer items
        for (const item of parsed.items || []) {
          // Find material/product
          let productId: number | undefined;
          try {
            productId = await findOrCreateEntity(item.materialName, 'material', db);
          } catch (err) {
            console.warn('Failed to find/create material:', err);
          }

          await db.addTransferItem({
            transferId: transfer.id,
            productId: productId!,
            requestedQuantity: item.quantity.toString(),
          });
        }

        await createAuditLog(ctx.user.id, 'create', 'inventoryTransfer', transfer.id, transfer.transferNumber, null, { source: 'text', originalText: input.text });

        return {
          transferId: transfer.id,
          transferNumber: transfer.transferNumber,
          parsed,
        };
      } catch (error) {
        console.error('[InventoryTransfer createFromText] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create inventory transfer from text'
        });
      }
    }),
};
