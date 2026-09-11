// appRouter.orders — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { scopeAllows } from "../_core/scope";
import { resolveRequestScope, scopedProcedure, createAuditLog, generateNumber } from "./_shared";

// ============================================
// SALES - ORDERS
// ============================================
export const ordersRouter = router({
    // Scope derived server-side from the caller's entity access (ctx.scope); status/customerId
    // remain client-side non-security filters. companyId is no longer a client input.
    list: scopedProcedure
      .input(z.object({
        status: z.string().optional(),
        customerId: z.number().optional(),
      }).optional())
      .query(({ input, ctx }) => db.getOrders(ctx.scope, { status: input?.status, customerId: input?.customerId })),
    get: scopedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input, ctx }) => db.getOrderWithItems(input.id, ctx.scope)),
    create: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        customerId: z.number().optional(),
        type: z.enum(['sales', 'return']).optional(),
        orderDate: z.date(),
        shippingAddress: z.string().optional(),
        billingAddress: z.string().optional(),
        subtotal: z.string(),
        taxAmount: z.string().optional(),
        shippingAmount: z.string().optional(),
        discountAmount: z.string().optional(),
        totalAmount: z.string(),
        currency: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().optional(),
          sku: z.string().optional(),
          name: z.string(),
          quantity: z.string(),
          unitPrice: z.string(),
          taxAmount: z.string().optional(),
          discountAmount: z.string().optional(),
          totalAmount: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { items, ...orderData } = input;
        // Can't create an order under an entity the caller doesn't have access to.
        if (orderData.companyId != null) {
          const scope = await resolveRequestScope(ctx.user);
          if (!scopeAllows(scope, orderData.companyId)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot create an order under an entity outside your access.' });
          }
        }
        const orderNumber = generateNumber('ORD');
        const result = await db.createOrder({ ...orderData, orderNumber, createdBy: ctx.user.id });
        
        if (items && items.length > 0) {
          for (const item of items) {
            await db.createOrderItem({ ...item, orderId: result.id });
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'order', result.id, orderNumber);
        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateOrder(id, data);
        await createAuditLog(ctx.user.id, 'update', 'order', id);

        // ── Cascade #16a: Order shipped/delivered → mark linked invoice as "sent" ──
        if (input.status === "shipped" || input.status === "delivered") {
          try {
            const order = await db.getOrderById(id);
            if (order?.invoiceId) {
              const invoice = await db.getInvoiceById(order.invoiceId);
              if (invoice && invoice.status === "draft") {
                await db.updateInvoice(order.invoiceId, { status: "sent" });
                console.log(`[Cascade] Order ${id} ${input.status} → Invoice ${order.invoiceId} marked as sent`);
              }
            }
          } catch (e) {
            console.warn("[Cascade] Order→Invoice status update failed:", e);
          }
        }

        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Delete order items first
        try { await db.deleteOrderItems(input.id); } catch { /* no items */ }
        await db.deleteOrder(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'order', input.id);
        return { success: true };
      }),
    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ input, ctx }) => {
        let deleted = 0;
        for (const id of input.ids) {
          try {
            try { await db.deleteOrderItems(id); } catch { /* no items */ }
            await db.deleteOrder(id);
            deleted++;
          } catch { /* skip */ }
        }
        await createAuditLog(ctx.user.id, 'delete', 'order', 0, undefined, undefined, { bulkDeleted: deleted });
        return { success: true, deleted };
      }),
  });
