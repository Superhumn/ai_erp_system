// appRouter.purchaseOrders — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "../_core/email";
import * as emailService from "../_core/emailService";
import { parseTextToPO, createPOPreview, createPOFromPreview } from "../textToPOService";
import * as db from "../db";
import { nanoid } from "nanoid";
import { purchaseOrderTextEndpoints } from "../naturalLanguageRouterExtensions";
import { opsProcedure, createAuditLog, generateNumber } from "./_shared";

// ============================================
// OPERATIONS - PURCHASE ORDERS
// ============================================
export const purchaseOrdersRouter = router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        vendorId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getPurchaseOrders(input)),
    get: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getPurchaseOrderWithItems(input.id)),
    getItems: opsProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(({ input }) => db.getPurchaseOrderItems(input.purchaseOrderId)),
    parsedInvoices: opsProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(({ input }) => db.getParsedDocumentsForPO(input.purchaseOrderId)),
    // All documents attached to a PO (parsed inbound + supplier-portal uploads +
    // operator uploads), normalized into a single view-ready list.
    documents: opsProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(({ input }) => db.getPurchaseOrderDocuments(input.purchaseOrderId)),
    parsedInvoiceCounts: opsProcedure
      .input(z.object({ purchaseOrderIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        const counts = await db.getParsedDocumentCountsByPO(input.purchaseOrderIds);
        return Array.from(counts.entries()).map(([purchaseOrderId, count]) => ({ purchaseOrderId, count }));
      }),
    // Total document count per PO across all sources (parsed + supplier + operator).
    documentCounts: opsProcedure
      .input(z.object({ purchaseOrderIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        const counts = await db.getDocumentCountsByPO(input.purchaseOrderIds);
        return Array.from(counts.entries()).map(([purchaseOrderId, count]) => ({ purchaseOrderId, count }));
      }),
    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        vendorId: z.number(),
        orderDate: z.date(),
        expectedDate: z.date().optional(),
        shippingAddress: z.string().optional(),
        subtotal: z.string(),
        taxAmount: z.string().optional(),
        shippingAmount: z.string().optional(),
        totalAmount: z.string(),
        currency: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().optional(),
          description: z.string(),
          quantity: z.string(),
          unitPrice: z.string(),
          totalAmount: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { items, ...poData } = input;
        const poNumber = generateNumber('PO');
        const result = await db.createPurchaseOrder({ ...poData, poNumber, createdBy: ctx.user.id });

        if (items && items.length > 0) {
          for (const item of items) {
            const poItem = await db.createPurchaseOrderItem({ ...item, purchaseOrderId: result.id });

            // Try to link to raw material if productId is provided
            if (item.productId) {
              const product = await db.getProductById(item.productId);
              if (product) {
                // Try to find matching raw material by name or SKU
                const rawMaterial = await db.getRawMaterialByNameOrSku(product.name, product.sku || '');
                if (rawMaterial) {
                  await db.createPurchaseOrderRawMaterialLink({
                    purchaseOrderItemId: poItem.id,
                    rawMaterialId: rawMaterial.id,
                    orderedQuantity: item.quantity,
                    unit: rawMaterial.unit || 'EA',
                  });
                }
              }
            }
          }
        }

        await createAuditLog(ctx.user.id, 'create', 'purchaseOrder', result.id, poNumber);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled']).optional(),
        receivedDate: z.date().optional(),
        expectedDate: z.date().nullable().optional(),
        orderDate: z.date().optional(),
        shippingAddress: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const oldPO = await db.getPurchaseOrderById(id);
        if (!oldPO) throw new TRPCError({ code: 'NOT_FOUND', message: 'Purchase order not found' });
        await db.updatePurchaseOrder(id, data);
        await createAuditLog(ctx.user.id, 'update', 'purchaseOrder', id, oldPO?.poNumber, oldPO, data);
        
        // Create notification for PO status changes
        if (data.status && oldPO?.status !== data.status) {
          const notificationType = data.status === 'received' ? 'po_received' as const :
            data.status === 'confirmed' ? 'po_approved' as const :
            data.status === 'partial' ? 'po_received' as const : 'system' as const;
          
          const opsUsers = await db.getUsersByRoles(['admin', 'ops', 'exec']);

          await db.notifyUsersOfEvent({
            type: notificationType,
            title: `PO ${oldPO?.poNumber} ${data.status}`,
            message: `Purchase Order ${oldPO?.poNumber} status changed from ${oldPO?.status} to ${data.status}`,
            entityType: 'purchase_order',
            entityId: id,
            severity: data.status === 'received' ? 'info' : 'info',
            // The client has no /:id route — deep-link the list, which opens the
            // detail drawer for ?po=<id>.
            link: `/operations/purchase-orders?po=${id}`,
          }, opsUsers.map(u => u.id));
        }
        
        return { success: true };
      }),
    // Replace the line items on a PO and recompute its totals. Editing items is
    // only allowed while the PO is still a draft (nothing has been sent/received).
    updateItems: opsProcedure
      .input(z.object({
        id: z.number(),
        items: z.array(z.object({
          productId: z.number().nullable().optional(),
          // Trim so a whitespace-only description ("   ") can't pass min(1) and
          // create a blank line item.
          description: z.string().trim().min(1),
          quantity: z.string(),
          unitPrice: z.string(),
          // Server recomputes the line total from quantity * unitPrice; a
          // caller-supplied total is ignored, so it's optional.
          totalAmount: z.string().optional(),
        })).min(1),
        taxAmount: z.string().optional(),
        shippingAmount: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const po = await db.getPurchaseOrderById(input.id);
        if (!po) throw new TRPCError({ code: 'NOT_FOUND', message: 'Purchase order not found' });
        if (po.status !== 'draft') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Line items can only be edited while the PO is a draft.' });
        }
        let subtotal: number;
        try {
          ({ subtotal } = await db.replacePurchaseOrderItems(input.id, input.items));
        } catch (e: any) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message || 'Invalid line items.' });
        }
        // Validate tax/shipping as finite, non-negative numbers rather than
        // silently coercing bad input to 0 (which could hide client bugs or
        // produce a negative total).
        // Strict parse (not parseFloat, which accepts "10abc" -> 10) so malformed
        // money strings are rejected rather than silently coerced.
        const parseMoney = (v: string | null | undefined, label: string): number => {
          const t = String(v ?? '0').trim();
          const n = /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
          if (!Number.isFinite(n) || n < 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid ${label}.` });
          }
          return n;
        };
        const tax = parseMoney(input.taxAmount ?? po.taxAmount, 'tax amount');
        const shipping = parseMoney(input.shippingAmount ?? po.shippingAmount, 'shipping amount');
        await db.updatePurchaseOrder(input.id, {
          subtotal: subtotal.toFixed(2),
          taxAmount: tax.toFixed(2),
          shippingAmount: shipping.toFixed(2),
          totalAmount: (subtotal + tax + shipping).toFixed(2),
        });
        await createAuditLog(ctx.user.id, 'update', 'purchaseOrder', input.id, po.poNumber);
        return { success: true };
      }),
    // Record received quantities against line items and advance the PO status
    // to partial / received accordingly.
    receiveItems: opsProcedure
      .input(z.object({
        id: z.number(),
        items: z.array(z.object({
          purchaseOrderItemId: z.number(),
          receivedQuantity: z.string(),
        })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const po = await db.getPurchaseOrderById(input.id);
        if (!po) throw new TRPCError({ code: 'NOT_FOUND', message: 'Purchase order not found' });
        if (po.status === 'cancelled') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This PO has been cancelled and cannot receive items.' });
        }
        if (po.status === 'draft') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Send this draft PO to the supplier before receiving items.' });
        }
        let result: { status: string | null };
        try {
          result = await db.setPurchaseOrderReceivedQuantities(input.id, input.items);
        } catch (e: any) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: e?.message || 'Invalid received quantities.' });
        }
        await createAuditLog(ctx.user.id, 'update', 'purchaseOrder', input.id, po.poNumber, { status: po.status }, { status: result.status });
        return { success: true, status: result.status };
      }),
    // Records one approval decision against the PO's threshold chain. A PO only
    // moves to "sent" (and reaches the vendor) once every level configured for
    // its value has signed off — previously any ops user could release a PO of
    // any size in one click, bypassing the approvalThresholds config entirely.
    approve: opsProcedure
      .input(z.object({ id: z.number(), notes: z.string().max(1000).optional() }))
      .mutation(async ({ input, ctx }) => {
        const state = await db.getPurchaseOrderApprovalState(input.id);
        if (!state) throw new TRPCError({ code: 'NOT_FOUND', message: 'Purchase order not found' });
        if (state.rejected) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This PO was rejected and cannot be approved.' });
        }

        if (!state.autoApprove) {
          const next = state.nextLevel;
          if (!next) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This PO is already fully approved.' });
          }
          if (!next.roles.includes(ctx.user.role)) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: `Level ${next.level} approval for this amount requires one of: ${next.roles.join(', ')}.`,
            });
          }
          await db.createPurchaseOrderApproval({
            purchaseOrderId: input.id,
            level: next.level,
            decision: 'approved',
            decidedBy: ctx.user.id,
            decidedByRole: ctx.user.role,
            notes: input.notes,
          });
        }

        // Re-read rather than reasoning from the pre-insert state, so a
        // concurrent approval of the same level can't release the PO twice.
        const after = await db.getPurchaseOrderApprovalState(input.id);
        if (!after?.fullyApproved) {
          await createAuditLog(ctx.user.id, 'approve', 'purchaseOrder', input.id, undefined, undefined, {
            level: state.nextLevel?.level,
            remainingLevels: after?.requiredLevels.filter((l) => l.level !== state.nextLevel?.level).length ?? 0,
          });
          return { success: true, fullyApproved: false, nextLevel: after?.nextLevel ?? null };
        }

        await db.updatePurchaseOrder(input.id, { status: 'sent', approvedBy: ctx.user.id, approvedAt: new Date() });
        await createAuditLog(ctx.user.id, 'approve', 'purchaseOrder', input.id);

        // Auto-send PO to vendor via email
        try {
          const po = await db.getPurchaseOrderById(input.id);
          if (po?.vendorId) {
            const { sendVendorEmail } = await import("../vendorEmailAutomation");
            await sendVendorEmail({
              vendorId: po.vendorId,
              emailType: "order_confirmation",
              purchaseOrderId: po.id,
              subject: `Purchase Order ${po.poNumber}`,
              triggeredBy: ctx.user.id,
            });
          }
        } catch (e) {
          console.warn("[PO Approval] Failed to auto-send PO to vendor:", e);
        }

        return { success: true, fullyApproved: true, nextLevel: null };
      }),
    reject: opsProcedure
      .input(z.object({ id: z.number(), notes: z.string().max(1000).optional() }))
      .mutation(async ({ input, ctx }) => {
        const state = await db.getPurchaseOrderApprovalState(input.id);
        if (!state) throw new TRPCError({ code: 'NOT_FOUND', message: 'Purchase order not found' });
        if (state.rejected) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This PO was already rejected.' });
        }
        // Anyone in the chain may reject — including a later level reviewing a
        // PO an earlier level already passed.
        const canReject = state.requiredLevels.some((l) => l.roles.includes(ctx.user.role));
        if (state.requiredLevels.length > 0 && !canReject) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not an approver for this purchase order.' });
        }
        await db.createPurchaseOrderApproval({
          purchaseOrderId: input.id,
          level: state.nextLevel?.level ?? 1,
          decision: 'rejected',
          decidedBy: ctx.user.id,
          decidedByRole: ctx.user.role,
          notes: input.notes,
        });
        await db.updatePurchaseOrder(input.id, { status: 'cancelled' });
        await createAuditLog(ctx.user.id, 'reject', 'purchaseOrder', input.id, undefined, { status: state.decisions.length }, { decision: 'rejected' });
        return { success: true };
      }),
    // Parse text to PO preview
    parseText: opsProcedure
      .input(z.object({ text: z.string().min(1).max(1000) }))
      .mutation(async ({ input }) => {
        const parsed = await parseTextToPO(input.text);
        const preview = await createPOPreview(parsed);
        return { parsed, preview };
      }),
    // Create PO from text and send email
    createFromText: opsProcedure
      .input(z.object({
        text: z.string().min(1),
        preview: z.object({
          vendorId: z.number(),
          vendorName: z.string(),
          rawMaterialId: z.number().nullable(),
          items: z.array(z.object({
            description: z.string(),
            quantity: z.string(),
            unitPrice: z.string(),
            totalAmount: z.string(),
            rawMaterialId: z.number().nullable().optional(),
          })),
          shippingAddress: z.string(),
          notes: z.string(),
          subtotal: z.string(),
          totalAmount: z.string(),
          suggested: z.boolean(),
          isPriceEstimated: z.boolean().default(false),
        }),
        sendEmail: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        // Create the PO from preview
        const po = await createPOFromPreview(input.preview as any, ctx.user.id);
        
        await createAuditLog(ctx.user.id, 'create', 'purchaseOrder', po.id, po.poNumber);
        
        // Send email if requested
        if (input.sendEmail) {
          const emailResult = await emailService.sendPOEmail(po.id, {
            triggeredBy: ctx.user.id,
          });
          
          if (!emailResult.success) {
            // Log the error but don't fail the whole operation since PO is already created
            console.error(`Failed to send PO email for PO ${po.id}:`, emailResult.error);
          }
          
          if (emailResult.success && emailResult.emailMessageId) {
            await createAuditLog(ctx.user.id, 'create', 'email_message', emailResult.emailMessageId, 'PO Email', undefined, {
              poId: po.id,
            });
          }
          
          return { 
            success: true, 
            po, 
            emailSent: emailResult.success,
            emailError: emailResult.error || undefined,
          };
        }
        
        return { success: true, po, emailSent: false };
      }),
    sendToSupplier: opsProcedure
      .input(z.object({
        poId: z.number(),
        message: z.string().optional(),
        createShipment: z.boolean().optional(),
        createFreightRfq: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const po = await db.getPurchaseOrderWithItems(input.poId);
        if (!po) throw new TRPCError({ code: 'NOT_FOUND', message: 'PO not found' });
        
        const vendor = await db.getVendorById(po.vendorId);
        if (!vendor) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vendor not found' });
        
        // Generate supplier portal link for document uploads
        const portalToken = nanoid(32);
        const portalLink = `${process.env.VITE_APP_URL || ''}/supplier-portal/${portalToken}`;
        
        // Create shipment if requested
        let shipmentId: number | undefined;
        if (input.createShipment) {
          const shipmentNumber = generateNumber('SHIP');
          const shipment = await db.createShipment({
            type: 'inbound',
            purchaseOrderId: po.id,
            shipmentNumber,
            status: 'pending',
            fromAddress: vendor.address || undefined,
          });
          shipmentId = shipment.id;
        }
        
        // Create freight RFQ if requested
        let rfqId: number | undefined;
        if (input.createFreightRfq) {
          const rfq = await db.createFreightRfq({
            title: `Freight for PO ${po.poNumber}`,
            purchaseOrderId: po.id,
            status: 'draft',
            originAddress: vendor.address || undefined,
            createdById: ctx.user.id,
          });
          rfqId = rfq.id;
        }
        
        // Send email to supplier
        if (vendor.email && isEmailConfigured()) {
          const itemsHtml = po.items?.map((item: any) => 
            `<tr><td>${item.description}</td><td>${item.quantity}</td><td>$${item.unitPrice}</td><td>$${item.totalAmount}</td></tr>`
          ).join('') || '';
          
          const emailHtml = formatEmailHtml(`
            <h2>Purchase Order: ${po.poNumber}</h2>
            <p>Dear ${vendor.contactName || vendor.name},</p>
            <p>Please find attached our purchase order ${po.poNumber}.</p>
            ${input.message ? `<p><strong>Message:</strong> ${input.message}</p>` : ''}
            
            <h3>Order Details</h3>
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
              <tr style="background: #f3f4f6;"><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
              ${itemsHtml}
              <tr><td colspan="3" style="text-align: right;"><strong>Subtotal:</strong></td><td>$${po.subtotal}</td></tr>
              <tr><td colspan="3" style="text-align: right;"><strong>Total:</strong></td><td><strong>$${po.totalAmount}</strong></td></tr>
            </table>
            
            <h3>Required Documentation</h3>
            <p>Please upload the following documents to our supplier portal:</p>
            <ul>
              <li>Commercial Invoice</li>
              <li>Packing List</li>
              <li>Product Dimensions & Weight</li>
              <li>HS Codes for all items</li>
              <li>Certificate of Origin (if applicable)</li>
              <li>MSDS/SDS (if applicable)</li>
            </ul>
            <p><a href="${portalLink}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Upload Documents to Portal</a></p>
            
            <p>Expected Delivery Date: ${po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'TBD'}</p>
            <p>Please confirm receipt of this order and provide estimated shipping date.</p>
          `);
          
          await sendEmail({
            to: vendor.email,
            subject: `Purchase Order ${po.poNumber} - Action Required`,
            html: emailHtml,
          });
        }
        
        // Update PO status to sent
        await db.updatePurchaseOrder(po.id, { status: 'sent' });
        await createAuditLog(ctx.user.id, 'update', 'purchaseOrder', po.id, po.poNumber);
        
        return { success: true, shipmentId, rfqId, portalToken };
      }),
    // Natural language text-to-PO (V2 endpoints)
    createFromTextV2: purchaseOrderTextEndpoints.createFromText,
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deletePurchaseOrder(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'purchaseOrder', input.id);
        return { success: true };
      }),
    // POs that duplicate another PO on (poNumber, vendor, total). Lets the list
    // filter down to the copies left behind by repeated document imports.
    duplicates: opsProcedure.query(() => db.getDuplicatePurchaseOrderGroups()),
    // Filtered / sorted / paged list for the PO page. `list` stays as-is for
    // its many other callers.
    listPaged: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        vendorId: z.number().optional(),
        search: z.string().optional(),
        orderDateFrom: z.date().optional(),
        orderDateTo: z.date().optional(),
        duplicatesOnly: z.boolean().optional(),
        sortBy: z.enum(['poNumber', 'vendor', 'totalAmount', 'status', 'orderDate', 'expectedDate', 'createdAt']).optional(),
        sortDir: z.enum(['asc', 'desc']).optional(),
        limit: z.number().min(1).max(200).optional(),
        offset: z.number().min(0).optional(),
      }).optional())
      .query(({ input }) => db.getPurchaseOrdersPaged(input ?? {})),
    // Count + value for the current filters, across the whole filtered set
    // rather than the visible page.
    summary: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        vendorId: z.number().optional(),
        search: z.string().optional(),
        orderDateFrom: z.date().optional(),
        orderDateTo: z.date().optional(),
        duplicatesOnly: z.boolean().optional(),
      }).optional())
      .query(({ input }) => db.getPurchaseOrderSummary(input ?? {})),
    // Flat rows for CSV export: same filters, no pagination, hard-capped so a
    // stray export can't try to stream the entire table.
    exportRows: opsProcedure
      .input(z.object({
        status: z.string().optional(),
        vendorId: z.number().optional(),
        search: z.string().optional(),
        orderDateFrom: z.date().optional(),
        orderDateTo: z.date().optional(),
        duplicatesOnly: z.boolean().optional(),
        sortBy: z.enum(['poNumber', 'vendor', 'totalAmount', 'status', 'orderDate', 'expectedDate', 'createdAt']).optional(),
        sortDir: z.enum(['asc', 'desc']).optional(),
      }).optional())
      .query(async ({ input }) => {
        const { rows } = await db.getPurchaseOrdersPaged({ ...(input ?? {}), limit: 5000 });
        return rows;
      }),
    // How much of each PO has actually arrived — drives the receipt progress
    // column without pulling every line item into the list.
    receiptProgress: opsProcedure
      .input(z.object({ purchaseOrderIds: z.array(z.number()) }))
      .query(({ input }) => db.getPurchaseOrderReceiptProgress(input.purchaseOrderIds)),
    // PO vs receipt vs vendor invoice, reconciled line by line.
    threeWayMatch: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const result = await db.getPurchaseOrderThreeWayMatch(input.id);
        if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Purchase order not found' });
        return result;
      }),
    // The approval chain this PO must clear, and how far through it is.
    approvalState: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const state = await db.getPurchaseOrderApprovalState(input.id);
        if (!state) throw new TRPCError({ code: 'NOT_FOUND', message: 'Purchase order not found' });
        return state;
      }),
    bulkUpdateStatus: opsProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1).max(500),
        status: z.enum(['draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled']),
      }))
      .mutation(async ({ input, ctx }) => {
        const poNumbers = new Map<number, string>();
        for (const id of input.ids) {
          const po = await db.getPurchaseOrderById(id);
          if (po) poNumbers.set(id, po.poNumber);
        }

        const { updated, failed } = await db.bulkUpdatePurchaseOrderStatus(input.ids, input.status);
        for (const id of updated) {
          await createAuditLog(ctx.user.id, 'update', 'purchaseOrder', id, poNumbers.get(id), undefined, { status: input.status });
        }
        return {
          success: failed.length === 0,
          updated: updated.length,
          failed: failed.map((f) => ({ ...f, poNumber: poNumbers.get(f.id) ?? `#${f.id}` })),
        };
      }),
    bulkDelete: opsProcedure
      .input(z.object({ ids: z.array(z.number()).min(1).max(500) }))
      .mutation(async ({ input, ctx }) => {
        // Resolve po numbers up front so the audit log still names what was
        // deleted after the rows are gone.
        const poNumbers = new Map<number, string>();
        for (const id of input.ids) {
          const po = await db.getPurchaseOrderById(id);
          if (po) poNumbers.set(id, po.poNumber);
        }

        const { deleted, failed } = await db.bulkDeletePurchaseOrders(input.ids);

        for (const id of deleted) {
          await createAuditLog(ctx.user.id, 'delete', 'purchaseOrder', id, poNumbers.get(id));
        }

        return {
          success: failed.length === 0,
          deleted: deleted.length,
          failed: failed.map((f) => ({ ...f, poNumber: poNumbers.get(f.id) ?? `#${f.id}` })),
        };
      }),
  });
