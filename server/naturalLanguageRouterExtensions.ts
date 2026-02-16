/**
 * Natural Language Router Extensions
 * Adds createFromText endpoints for all major entities
 */

import { z } from 'zod';
import { router, opsProcedure, financeProcedure } from './routers';
import { parseEntityText, findOrCreateEntity } from './_core/universalTextParser';
import { generateNumber, createAuditLog } from './routers';
import * as db from './db';
import { TRPCError } from '@trpc/server';

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
            // If material creation fails, we'll create the PO item without linking
            console.warn('Failed to link material:', err);
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
          estimatedDelivery: parsed.estimatedDelivery ? new Date(parsed.estimatedDelivery) : undefined,
          weight: parsed.weight ? parsed.weight.toString() : undefined,
          notes: parsed.notes || undefined,
        });
        
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
            console.warn('Failed to find/create payer entity:', err);
          }
        }
        
        // Find invoice if mentioned
        let invoiceId: number | undefined;
        if (parsed.invoiceNumber) {
          const invoice = await db.getInvoiceByNumber(parsed.invoiceNumber);
          if (invoice) {
            invoiceId = invoice.id;
          }
        }
        
        // Create payment record
        const payment = await db.createPayment({
          invoiceId,
          customerId,
          vendorId,
          amount: parsed.amount.toFixed(2),
          paymentDate: parsed.paymentDate ? new Date(parsed.paymentDate) : new Date(),
          paymentMethod: parsed.paymentMethod || 'bank_transfer',
          referenceNumber: parsed.referenceNumber || undefined,
          currency: parsed.currency || 'USD',
          notes: parsed.notes || undefined,
          status: 'completed',
        });
        
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
        const workOrderNumber = generateNumber('WO');
        const workOrder = await db.createWorkOrder({
          workOrderNumber,
          productId,
          productName: parsed.productName,
          quantity: parsed.quantity.toString(),
          unit: parsed.unit || 'units',
          status: 'draft',
          priority: parsed.priority || 'medium',
          dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
          batchSize: parsed.batchSize ? parsed.batchSize.toString() : undefined,
          notes: parsed.notes || undefined,
          createdBy: ctx.user.id,
        });
        
        await createAuditLog(ctx.user.id, 'create', 'workOrder', workOrder.id, workOrderNumber, null, { source: 'text', originalText: input.text });
        
        return {
          workOrderId: workOrder.id,
          workOrderNumber,
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
        const fromWarehouse = await db.getWarehouseByName(parsed.fromLocation);
        const toWarehouse = await db.getWarehouseByName(parsed.toLocation);
        
        if (!fromWarehouse || !toWarehouse) {
          throw new Error(`Warehouse not found: ${!fromWarehouse ? parsed.fromLocation : parsed.toLocation}`);
        }
        
        // Create inventory transfer
        const transferNumber = generateNumber('TRF');
        const transfer = await db.createInventoryTransfer({
          transferNumber,
          fromWarehouseId: fromWarehouse.id,
          toWarehouseId: toWarehouse.id,
          transferDate: parsed.transferDate ? new Date(parsed.transferDate) : new Date(),
          status: 'pending',
          reason: parsed.reason || undefined,
          notes: parsed.notes || undefined,
          createdBy: ctx.user.id,
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
          
          await db.createInventoryTransferItem({
            transferId: transfer.id,
            productId,
            productName: item.materialName,
            quantity: item.quantity.toString(),
            unit: item.unit || 'units',
          });
        }
        
        await createAuditLog(ctx.user.id, 'create', 'inventoryTransfer', transfer.id, transferNumber, null, { source: 'text', originalText: input.text });
        
        return {
          transferId: transfer.id,
          transferNumber,
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
