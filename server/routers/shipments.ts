// appRouter.shipments — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { opsProcedure, createAuditLog, generateNumber } from "./_shared";

// ============================================
// OPERATIONS - SHIPMENTS
// ============================================
export const shipmentsRouter = router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        type: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getShipments(input)),
    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.enum(['inbound', 'outbound']),
        orderId: z.number().optional(),
        purchaseOrderId: z.number().optional(),
        rawMaterialId: z.number().optional(),
        quantity: z.string().regex(/^\d+(\.\d+)?$/, "quantity must be numeric").optional(),
        carrier: z.string().optional(),
        trackingNumber: z.string().optional(),
        shipDate: z.date().optional(),
        fromAddress: z.string().optional(),
        toAddress: z.string().optional(),
        weight: z.string().optional(),
        cost: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const shipmentNumber = generateNumber('SHIP');
        const result = await db.createShipment({ ...input, shipmentNumber });
        await createAuditLog(ctx.user.id, 'create', 'shipment', result.id, shipmentNumber);

        // ── Inventory link: inbound shipment carrying a raw material reserves
        // the quantity as "in transit" until it's marked delivered. ──
        if (input.type === 'inbound' && input.rawMaterialId && input.quantity) {
          try {
            const qty = parseFloat(input.quantity);
            if (qty > 0) {
              await db.adjustRawMaterialInventory(input.rawMaterialId, { inTransit: qty }, {
                receivingStatus: 'in_transit',
                ...(input.shipDate ? { expectedDeliveryDate: input.shipDate } : {}),
              });
            }
          } catch (e) {
            console.warn('[Shipment] inbound in-transit inventory update failed:', e);
          }
        }

        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'in_transit', 'delivered', 'returned', 'cancelled']).optional(),
        trackingNumber: z.string().optional(),
        deliveryDate: z.date().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const oldShipment = await db.getShipmentById(id);
        await db.updateShipment(id, data);
        await createAuditLog(ctx.user.id, 'update', 'shipment', id);

        // ── Inventory link: keep raw-material stock in sync with shipment status. ──
        // Delivery moves the carried quantity from "in transit" → "received".
        // Cancel/return releases the reservation. Guarded on the prior status so
        // repeated updates can't double-count.
        if (
          oldShipment?.type === 'inbound' &&
          oldShipment.rawMaterialId &&
          oldShipment.quantity &&
          data.status &&
          data.status !== oldShipment.status
        ) {
          try {
            const qty = parseFloat(oldShipment.quantity);
            const materialId = oldShipment.rawMaterialId;
            if (qty > 0) {
              if (data.status === 'delivered') {
                // Arrived: move the quantity from in-transit into received.
                await db.adjustRawMaterialInventory(materialId, { inTransit: -qty, received: qty }, {
                  receivingStatus: 'received',
                  lastReceivedDate: new Date(),
                  lastReceivedQty: String(qty),
                });
              } else if (oldShipment.status === 'delivered') {
                // Reversing a previously-delivered shipment: pull the quantity
                // back out of received so inventory isn't overstated. If it's
                // going back to a pre-delivery state, restore the reservation.
                const restoreInTransit = data.status === 'pending' || data.status === 'in_transit';
                await db.adjustRawMaterialInventory(
                  materialId,
                  { received: -qty, ...(restoreInTransit ? { inTransit: qty } : {}) },
                  { receivingStatus: restoreInTransit ? 'in_transit' : 'none' },
                );
              } else if (data.status === 'cancelled' || data.status === 'returned') {
                // Pre-delivery cancellation: release the in-transit reservation.
                await db.adjustRawMaterialInventory(materialId, { inTransit: -qty }, { receivingStatus: 'none' });
              }
            }
          } catch (e) {
            console.warn('[Shipment] inventory sync on status change failed:', e);
          }
        }
        
        // Create notification for shipment status changes
        if (data.status && oldShipment?.status !== data.status) {
          const opsUsers = await db.getUsersByRoles(['admin', 'ops', 'exec']);

          await db.notifyUsersOfEvent({
            type: 'shipping_update',
            title: `Shipment ${oldShipment?.shipmentNumber} ${data.status}`,
            message: `Shipment ${oldShipment?.shipmentNumber} status changed to ${data.status}${data.trackingNumber ? ` (Tracking: ${data.trackingNumber})` : ''}`,
            entityType: 'shipment',
            entityId: id,
            severity: data.status === 'delivered' ? 'info' : data.status === 'returned' ? 'warning' : 'info',
            link: `/operations/shipments`,
            metadata: { trackingNumber: data.trackingNumber || oldShipment?.trackingNumber },
          }, opsUsers.map(u => u.id));
        }

        // ── Cascade #16c: Shipment delivered → update linked order to "delivered" ──
        if (data.status === "delivered") {
          try {
            const shipment = await db.getShipmentById(id);
            if (shipment?.orderId) {
              const order = await db.getOrderById(shipment.orderId);
              if (order && order.status !== "delivered" && order.status !== "cancelled") {
                await db.updateOrder(shipment.orderId, { status: "delivered" });
                console.log(`[Cascade] Shipment ${id} delivered → Order ${shipment.orderId} marked as delivered`);

                // Create a notification for the delivery
                const deliveryUsers = await db.getUsersByRoles(['admin', 'ops', 'sales', 'exec']);
                await db.notifyUsersOfEvent({
                  type: 'sales_order_delivered',
                  title: `Order ${order.orderNumber} delivered`,
                  message: `Order ${order.orderNumber} has been marked as delivered following shipment delivery.`,
                  entityType: 'order',
                  entityId: shipment.orderId,
                  severity: 'info',
                  link: `/sales/orders`,
                  metadata: { shipmentId: id },
                }, deliveryUsers.map(u => u.id));
              }
            }
          } catch (e) {
            console.warn("[Cascade] Shipment delivered→Order update failed:", e);
          }
        }

        return { success: true };
      }),

    createFromText: opsProcedure
      .input(z.object({ text: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const parsed = await invokeLLM({
          messages: [
            { role: 'system', content: 'Extract shipment details from the text and return a JSON object with: trackingNumber (string or null), carrier (string or null), type ("inbound" or "outbound"), notes (string). Return only valid JSON.' },
            { role: 'user', content: input.text },
          ],
        });
        let shipmentData: any = {};
        try {
          const rawContent = parsed.choices[0]?.message?.content;
          const raw = typeof rawContent === 'string' ? rawContent : '{}';
          shipmentData = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        } catch { shipmentData = {}; }
        const shipmentNumber = generateNumber('SHIP');
        const trackingNumber = shipmentData.trackingNumber || shipmentNumber;
        const result = await db.createShipment({
          shipmentNumber,
          trackingNumber,
          type: shipmentData.type || 'inbound',
          carrier: shipmentData.carrier,
          notes: shipmentData.notes || input.text,
          status: 'pending',
        } as any);
        await createAuditLog(ctx.user.id, 'create', 'shipment', result.id, shipmentNumber);
        return { trackingNumber, shipmentNumber, id: result.id };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteShipment(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'shipment', input.id);
        return { success: true };
      }),
  });
