// appRouter.salesOrders — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { recordCogs } from "../inventoryCostingService";
import * as db from "../db";

// ============================================
// SALES ORDERS
// ============================================
export const salesOrdersRouter = router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'confirmed', 'allocated', 'picking', 'shipped', 'delivered', 'cancelled']).optional(),
        source: z.enum(['shopify', 'amazon', 'manual', 'api']).optional(),
        customerId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getSalesOrders(input);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const order = await db.getSalesOrderById(input.id);
        if (!order) return null;
        const lines = await db.getSalesOrderLines(input.id);
        const reservations = await db.getInventoryReservations(input.id);
        return { ...order, lines, reservations };
      }),
    create: protectedProcedure
      .input(z.object({
        customerId: z.number().optional(),
        source: z.enum(['shopify', 'manual', 'api', 'other']).default('manual'),
        orderDate: z.date().optional(),
        requestedShipDate: z.date().optional(),
        shippingAddress: z.string().optional(),
        notes: z.string().optional(),
        lines: z.array(z.object({
          productId: z.number(),
          quantity: z.string(),
          unitPrice: z.string(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const totalAmount = input.lines.reduce((sum, line) => {
          return sum + parseFloat(line.quantity) * parseFloat(line.unitPrice);
        }, 0);
        
        const { id: orderId, orderNumber } = await db.createSalesOrder({
          customerId: input.customerId,
          source: input.source,
          status: 'pending',
          orderDate: input.orderDate || new Date(),
          shippingAddress: input.shippingAddress,
          notes: input.notes,
          totalAmount: totalAmount.toString(),
        });
        
        for (const line of input.lines) {
          await db.createSalesOrderLine({
            salesOrderId: orderId,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalPrice: (parseFloat(line.quantity) * parseFloat(line.unitPrice)).toString(),
          });
        }

        // Auto-record COGS for each line item
        try {
          const { recordCogs } = await import("../inventoryCostingService");
          for (const line of input.lines) {
            if (line.productId && parseFloat(line.quantity) > 0) {
              await recordCogs({
                productId: line.productId,
                quantitySold: parseFloat(line.quantity),
                orderId: orderId,
                unitRevenue: parseFloat(line.unitPrice),
              });
            }
          }
        } catch (e) {
          console.warn("[COGS] Failed to auto-record COGS on sales order:", e);
        }

        // Auto-generate invoice from sales order
        try {
          const invoice = await db.createInvoice({
            customerId: input.customerId,
            invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`,
            issueDate: new Date(),
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Net 30
            subtotal: totalAmount.toString(),
            taxAmount: "0",
            totalAmount: totalAmount.toString(),
            status: "draft",
            type: "invoice",
            notes: `Auto-generated from Sales Order #${orderId}`,
            createdBy: ctx.user.id,
          });
          for (const line of input.lines) {
            await db.createInvoiceItem({
              invoiceId: invoice.id,
              description: `Product ${line.productId}`,
              productId: line.productId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalAmount: (parseFloat(line.quantity) * parseFloat(line.unitPrice)).toString(),
            });
          }
        } catch (e) {
          console.warn("[Auto-Invoice] Failed to auto-generate invoice from sales order:", e);
        }

        return { id: orderId, orderNumber };
      }),
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
      }))
      .mutation(async ({ input }) => {
        await db.updateSalesOrder(input.id, { status: input.status });
        return { success: true };
      }),
  });
