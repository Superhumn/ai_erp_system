import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "../_core/email";
import * as emailService from "../_core/emailService";
import { parseUploadedDocument, importPurchaseOrder, importFreightInvoice, importVendorInvoice, importCustomsDocument, matchLineItemsToMaterials } from "../documentImportService";
import { analyzeNegotiationOpportunity, initiateNegotiation, addNegotiationRound, generateNegotiationDraft } from "../vendorNegotiationService";
import { parseTextToPO, createPOPreview, createPOFromPreview } from "../textToPOService";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { listDriveFolders } from "../_core/googleDrive";
import { normalizeQuotesForRfq, basisFromRfq, INCOTERM_CODES } from "../quoteNormalization";
import { ingestVendorQuoteEmail, parseVendorQuoteAttachment, parseVendorQuoteEmail } from "../vendorQuoteParser";
import { computeResponsivenessForVendors, computeVendorResponsiveness, markStaleInvitationsNoResponse, responsivenessScoreFromMetrics } from "../vendorResponsiveness";
import { getCompanyWebSources, sourceCompanyContacts, sourceCompanyContactsBatch } from "../companyContactSourcing";
import { router, publicProcedure, protectedProcedure, opsProcedure, copackerProcedure, vendorProcedure, createAuditLog, generateNumber } from "./middleware";

// Upper bound on a single RFQ blast — mirrors MAX_RFQ_VENDORS_PER_SEND in
// server/routers.ts. Each vendor costs an LLM draft plus an email send.
const MAX_RFQ_VENDORS_PER_SEND = 50;

export const procurementRouter = router({
  // ============================================
  // VENDOR MANAGEMENT
  // ============================================
  vendors: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getVendors(input?.companyId)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getVendorById(input.id)),
    create: opsProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        type: z.enum(['supplier', 'contractor', 'service']).optional(),
        paymentTerms: z.number().optional(),
        defaultLeadTimeDays: z.number().optional(),
        taxId: z.string().optional(),
        website: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createVendor(input);
        await createAuditLog(ctx.user.id, 'create', 'vendor', result.id, input.name);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        status: z.enum(['active', 'inactive', 'pending']).optional(),
        paymentTerms: z.number().optional(),
        defaultLeadTimeDays: z.number().optional(),
        notes: z.string().optional(),
        website: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateVendor(id, data);
        await createAuditLog(ctx.user.id, 'update', 'vendor', id);
        return { success: true };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteVendor(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'vendor', input.id);
        return { success: true };
      }),

    /**
     * Read this vendor's own website and fill in contact details from it.
     * Only own-domain pages are trusted; only an own-domain email verifies.
     */
    sourceFromWebsite: opsProcedure
      .input(z.object({
        vendorId: z.number(),
        website: z.string().optional(),
        overwriteExisting: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const vendor = await db.getVendorById(input.vendorId);
        if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
        const result = await sourceCompanyContacts({
          entityType: "vendor",
          entityId: input.vendorId,
          website: input.website,
          overwriteExisting: input.overwriteExisting,
          requestedBy: ctx.user.id,
        });
        await createAuditLog(
          ctx.user.id, "update", "vendor", input.vendorId, vendor.name, null,
          { contactSourcing: result.status, verified: result.verified, applied: result.applied },
        );
        return result;
      }),

    webSources: protectedProcedure
      .input(z.object({ vendorId: z.number(), limit: z.number().min(1).max(100).optional() }))
      .query(({ input }) => getCompanyWebSources("vendor", input.vendorId, input.limit)),

    sourceFromWebsiteBatch: opsProcedure
      .input(z.object({
        vendorIds: z.array(z.number()).min(1).max(25),
        overwriteExisting: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const summary = await sourceCompanyContactsBatch(
          Array.from(new Set(input.vendorIds)).map(entityId => ({ entityType: "vendor" as const, entityId })),
          { overwriteExisting: input.overwriteExisting, requestedBy: ctx.user.id },
        );
        await createAuditLog(
          ctx.user.id, "update", "vendor", 0,
          `Sourced contacts from ${input.vendorIds.length} vendor websites (${summary.verifiedCount} verified)`,
        );
        return summary;
      }),
  }),
  // ============================================
  // OPERATIONS - PURCHASE ORDERS
  // ============================================
  purchaseOrders: router({
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
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const oldPO = await db.getPurchaseOrderById(id);
        await db.updatePurchaseOrder(id, data);
        await createAuditLog(ctx.user.id, 'update', 'purchaseOrder', id, oldPO?.poNumber, oldPO, data);
        
        // Create notification for PO status changes
        if (data.status && oldPO?.status !== data.status) {
          const notificationType = data.status === 'received' ? 'po_received' as const :
            data.status === 'confirmed' ? 'po_approved' as const :
            data.status === 'partial' ? 'po_received' as const : 'system' as const;
          
          const allUsers = await db.getAllUsers();
          const opsUsers = allUsers.filter(u => ['admin', 'ops', 'exec'].includes(u.role));
          
          await db.notifyUsersOfEvent({
            type: notificationType,
            title: `PO ${oldPO?.poNumber} ${data.status}`,
            message: `Purchase Order ${oldPO?.poNumber} status changed from ${oldPO?.status} to ${data.status}`,
            entityType: 'purchase_order',
            entityId: id,
            severity: data.status === 'received' ? 'info' : 'info',
            link: `/operations/purchase-orders/${id}`,
          }, opsUsers.map(u => u.id));
        }
        
        return { success: true };
      }),
    approve: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
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
            rawMaterialId: z.number().nullable(),
          })),
          shippingAddress: z.string(),
          notes: z.string(),
          subtotal: z.string(),
          totalAmount: z.string(),
          suggested: z.boolean(),
          isPriceEstimated: z.boolean().optional(),
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
  }),
  // ============================================
  // OPERATIONS - SHIPMENTS
  // ============================================
  shipments: router({
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
        const [oldShipment] = await db.getShipments({ id } as any) || [];
        await db.updateShipment(id, data);
        await createAuditLog(ctx.user.id, 'update', 'shipment', id);
        
        // Create notification for shipment status changes
        if (data.status && oldShipment?.status !== data.status) {
          const allUsers = await db.getAllUsers();
          const opsUsers = allUsers.filter(u => ['admin', 'ops', 'exec'].includes(u.role));
          
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
        
        return { success: true };
      }),
  }),
  // Copacker Portal - restricted views for copackers
  copackerPortal: router({
    // Get inventory for copacker's assigned warehouse
    getInventory: copackerProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'copacker' && !ctx.user.linkedWarehouseId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'No warehouse assigned to this account' });
      }
      
      const warehouseId = ctx.user.role === 'copacker' 
        ? ctx.user.linkedWarehouseId! 
        : null;
      
      if (warehouseId) {
        return db.getInventoryByWarehouse(warehouseId);
      }
      
      // Admin/ops can see all
      return db.getInventory();
    }),

    // Get copacker's assigned warehouse info
    getWarehouse: copackerProcedure.query(async ({ ctx }) => {
      if (!ctx.user.linkedWarehouseId) {
        return null;
      }
      return db.getWarehouseById(ctx.user.linkedWarehouseId);
    }),

    // Update inventory quantity (copacker can only update their warehouse)
    updateInventory: copackerProcedure
      .input(z.object({
        inventoryId: z.number(),
        quantity: z.number().min(0),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify copacker has access to this inventory item
        if (ctx.user.role === 'copacker' && ctx.user.linkedWarehouseId) {
          const inventoryItems = await db.getInventoryByWarehouse(ctx.user.linkedWarehouseId);
          const hasAccess = inventoryItems.some(item => item.inventory.id === input.inventoryId);
          if (!hasAccess) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this inventory item' });
          }
        }

        await db.updateInventoryQuantityById(input.inventoryId, input.quantity, ctx.user.id, input.notes);

        // Check if stock is low and trigger auto-purchase order if needed
        const autoPurchaseResult = await db.checkAndTriggerLowStockPurchaseOrder(input.inventoryId, ctx.user.id);

        return {
          success: true,
          autoPurchase: autoPurchaseResult
        };
      }),

    // Get shipments for copacker's warehouse (filter by PO vendor)
    getShipments: copackerProcedure.query(async ({ ctx }) => {
      const allShipments = await db.getShipments();
      // Copackers see all shipments - they can filter by their location in the UI
      return allShipments;
    }),

    // Upload shipment document (copacker can upload for their shipments)
    uploadShipmentDocument: copackerProcedure
      .input(z.object({
        shipmentId: z.number(),
        documentType: z.enum(['invoice', 'receipt', 'contract', 'legal', 'report', 'hr', 'other']),
        name: z.string(),
        fileData: z.string(), // Base64 encoded
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `shipments/${input.shipmentId}/${nanoid()}-${input.name}`;
        
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        const result = await db.createDocument({
          name: input.name,
          type: input.documentType,
          category: 'shipment',
          fileUrl: url,
          fileKey,
          mimeType: input.mimeType,
          fileSize: buffer.length,
          uploadedBy: ctx.user.id,
          referenceType: 'shipment',
          referenceId: input.shipmentId,
        });

        await createAuditLog(ctx.user.id, 'create', 'document', result.id, input.name);
        
        return { id: result.id, url };
      }),

    getCustomsClearances: copackerProcedure.query(async ({ ctx }) => {
      const allClearances = await db.getCustomsClearances();
      if (ctx.user.role !== 'copacker') return allClearances;
      const allShipments = await db.getShipments();
      const shipmentIds = new Set(allShipments.map((s: any) => s.id));
      return allClearances.filter((c: any) => c.shipmentId != null && shipmentIds.has(c.shipmentId));
    }),

    getCustomsDocuments: copackerProcedure
      .input(z.object({ clearanceId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === 'copacker') {
          const clearance = await db.getCustomsClearanceById(input.clearanceId);
          if (!clearance?.shipmentId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this customs clearance' });
          }
          const shipment = await db.getShipmentById(clearance.shipmentId);
          if (!shipment) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this customs clearance' });
          }
        }
        return db.getCustomsDocuments(input.clearanceId);
      }),
  }),
  // Vendor Portal - restricted views for vendors
  vendorPortal: router({
    // Get purchase orders for vendor
    getPurchaseOrders: vendorProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
        const allPOs = await db.getPurchaseOrders();
        return allPOs.filter(po => po.vendorId === ctx.user.linkedVendorId);
      }
      return db.getPurchaseOrders();
    }),

    // Get vendor's own info
    getVendorInfo: vendorProcedure.query(async ({ ctx }) => {
      if (!ctx.user.linkedVendorId) {
        return null;
      }
      return db.getVendorById(ctx.user.linkedVendorId);
    }),

    // Update PO status (vendor can mark as confirmed, partial, received)
    updatePOStatus: vendorProcedure
      .input(z.object({
        poId: z.number(),
        status: z.enum(['confirmed', 'partial', 'received']),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify vendor has access to this PO
        if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
          const allPOs = await db.getPurchaseOrders();
          const po = allPOs.find(p => p.id === input.poId);
          if (!po || po.vendorId !== ctx.user.linkedVendorId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this purchase order' });
          }
        }

        await db.updatePurchaseOrder(input.poId, { 
          status: input.status,
          notes: input.notes,
        });
        await createAuditLog(ctx.user.id, 'update', 'purchase_order', input.poId);
        return { success: true };
      }),

    // Get shipments for vendor
    getShipments: vendorProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
        const allShipments = await db.getShipments();
        // Filter shipments related to vendor's POs
        const vendorPOs = await db.getPurchaseOrders();
        const vendorPOIds = vendorPOs
          .filter(po => po.vendorId === ctx.user.linkedVendorId)
          .map(po => po.id);
        return allShipments.filter(s => s.purchaseOrderId && vendorPOIds.includes(s.purchaseOrderId));
      }
      return db.getShipments();
    }),

    // Upload document for vendor's shipment/PO
    uploadDocument: vendorProcedure
      .input(z.object({
        relatedEntityType: z.enum(['purchase_order', 'shipment']),
        relatedEntityId: z.number(),
        documentType: z.enum(['invoice', 'receipt', 'contract', 'legal', 'report', 'hr', 'other']),
        name: z.string(),
        fileData: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify vendor has access
        if (ctx.user.role === 'vendor' && ctx.user.linkedVendorId) {
          if (input.relatedEntityType === 'purchase_order') {
            const allPOs = await db.getPurchaseOrders();
            const po = allPOs.find(p => p.id === input.relatedEntityId);
            if (!po || po.vendorId !== ctx.user.linkedVendorId) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this purchase order' });
            }
          }
        }

        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `vendor/${ctx.user.linkedVendorId || 'unknown'}/${input.relatedEntityType}/${input.relatedEntityId}/${nanoid()}-${input.name}`;
        
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        const result = await db.createDocument({
          name: input.name,
          type: input.documentType,
          category: input.relatedEntityType === 'purchase_order' ? 'legal' : 'other',
          fileUrl: url,
          fileKey,
          mimeType: input.mimeType,
          fileSize: buffer.length,
          uploadedBy: ctx.user.id,
          referenceType: input.relatedEntityType,
          referenceId: input.relatedEntityId,
        });

        await createAuditLog(ctx.user.id, 'create', 'document', result.id, input.name);
        
        return { id: result.id, url };
      }),

    getCustomsClearances: vendorProcedure.query(async ({ ctx }) => {
      const allClearances = await db.getCustomsClearances();
      if (ctx.user.role !== 'vendor') return allClearances;
      const allPOs = await db.getPurchaseOrders();
      const vendorPOIds = new Set(
        allPOs.filter((po: any) => po.vendorId === ctx.user.linkedVendorId).map((po: any) => po.id)
      );
      const allShipments = await db.getShipments();
      const vendorShipmentIds = new Set(
        allShipments
          .filter((s: any) => s.purchaseOrderId != null && vendorPOIds.has(s.purchaseOrderId))
          .map((s: any) => s.id)
      );
      return allClearances.filter((c: any) => c.shipmentId != null && vendorShipmentIds.has(c.shipmentId));
    }),

    getCustomsDocuments: vendorProcedure
      .input(z.object({ clearanceId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === 'vendor') {
          const clearance = await db.getCustomsClearanceById(input.clearanceId);
          if (!clearance?.shipmentId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this customs clearance' });
          }
          const shipment = await db.getShipmentById(clearance.shipmentId);
          if (!shipment?.purchaseOrderId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this customs clearance' });
          }
          const po = await db.getPurchaseOrderById(shipment.purchaseOrderId);
          if (!po || po.vendorId !== ctx.user.linkedVendorId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this customs clearance' });
          }
        }
        return db.getCustomsDocuments(input.clearanceId);
      }),
  }),
  // PO Receiving
  poReceiving: router({
    getRecords: protectedProcedure
      .input(z.object({ purchaseOrderId: z.number() }))
      .query(async ({ input }) => {
        return db.getPoReceivingRecords(input.purchaseOrderId);
      }),
    getItems: protectedProcedure
      .input(z.object({ receivingRecordId: z.number() }))
      .query(async ({ input }) => {
        return db.getPoReceivingItems(input.receivingRecordId);
      }),
    receive: protectedProcedure
      .input(z.object({
        purchaseOrderId: z.number(),
        warehouseId: z.number(),
        shipmentId: z.number().optional(),
        items: z.array(z.object({
          purchaseOrderItemId: z.number(),
          rawMaterialId: z.number().optional(),
          productId: z.number().optional(),
          quantity: z.number(),
          unit: z.string(),
          lotNumber: z.string().optional(),
          expirationDate: z.date().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.receivePurchaseOrderItems(
          input.purchaseOrderId,
          input.warehouseId,
          input.items,
          ctx.user?.id,
          input.shipmentId
        );
        return result;
      }),
  }),
  // ============================================
  // VENDOR QUOTE MANAGEMENT (RFQ System)
  // ============================================
  vendorQuotes: router({
    // Dashboard stats
    dashboardStats: protectedProcedure.query(async () => {
      const rfqs = await db.getVendorRfqs();
      const quotes = await db.getVendorQuotes();
      return {
        totalRfqs: rfqs.length,
        activeRfqs: rfqs.filter(r => ['sent', 'partially_received'].includes(r.status)).length,
        totalQuotes: quotes.length,
        pendingQuotes: quotes.filter(q => q.status === 'pending').length,
        receivedQuotes: quotes.filter(q => q.status === 'received').length,
      };
    }),
    
    // RFQs
    rfqs: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional(), rawMaterialId: z.number().optional() }).optional())
        .query(({ input }) => db.getVendorRfqs(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getVendorRfqById(input.id)),
      create: opsProcedure
        .input(z.object({
          materialName: z.string().min(1),
          rawMaterialId: z.number().optional(),
          materialDescription: z.string().optional(),
          quantity: z.string(),
          unit: z.string(),
          specifications: z.string().optional(),
          requiredDeliveryDate: z.date().optional(),
          deliveryLocation: z.string().optional(),
          deliveryAddress: z.string().optional(),
          incoterms: z.string().optional(),
          quoteDueDate: z.date().optional(),
          validityPeriod: z.number().optional(),
          priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const rfqNumber = await db.generateVendorRfqNumber();
          const result = await db.createVendorRfq({ ...input, rfqNumber, createdById: ctx.user.id });
          await createAuditLog(ctx.user.id, 'create', 'vendor_rfq', result.id, rfqNumber);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['draft', 'sent', 'partially_received', 'all_received', 'awarded', 'cancelled', 'expired']).optional(),
          materialName: z.string().optional(),
          materialDescription: z.string().optional(),
          quantity: z.string().optional(),
          specifications: z.string().optional(),
          requiredDeliveryDate: z.date().optional(),
          quoteDueDate: z.date().optional(),
          notes: z.string().optional(),
          internalNotes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateVendorRfq(id, data);
          await createAuditLog(ctx.user.id, 'update', 'vendor_rfq', id);
          return { success: true };
        }),
      
      // Send RFQ to vendors via AI email
      sendToVendors: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          // Payload guard only; the real cap is on the DISTINCT count below.
          vendorIds: z.array(z.number()).min(1).max(MAX_RFQ_VENDORS_PER_SEND * 4),
        }))
        .mutation(async ({ input, ctx }) => {
          const rfq = await db.getVendorRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'RFQ not found' });

          const targetVendorIds = Array.from(new Set(input.vendorIds));
          if (targetVendorIds.length > MAX_RFQ_VENDORS_PER_SEND) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `An RFQ can go to at most ${MAX_RFQ_VENDORS_PER_SEND} vendors at a time (received ${targetVendorIds.length}).`,
            });
          }

          const results = { sent: 0, failed: 0, skipped: 0, emails: [] as any[] };

          const existingInvitations = await db.getVendorRfqInvitations(input.rfqId);
          const alreadyInvited = new Set(existingInvitations.map(i => i.vendorId));

          for (const vendorId of targetVendorIds) {
            if (alreadyInvited.has(vendorId)) {
              results.skipped++;
              results.emails.push({ vendorId, status: 'skipped', error: 'Already invited on this RFQ' });
              continue;
            }
            const vendor = await db.getVendorById(vendorId);
            if (!vendor || !vendor.email) {
              results.failed++;
              results.emails.push({
                vendorId,
                vendorName: vendor?.name,
                status: 'failed',
                error: vendor ? 'No email address on this vendor' : 'Vendor not found',
              });
              continue;
            }

            // Same rule as carriers: an address nothing has confirmed is not an
            // address to send an RFQ to.
            if ((vendor as any).contactSource === 'discovered') {
              results.skipped++;
              results.emails.push({
                vendorId,
                vendorName: vendor.name,
                status: 'blocked',
                error: 'Contact details are unverified — source them from the vendor\'s website '
                  + 'or enter them by hand before sending.',
              });
              continue;
            }

            // Create invitation record
            const invitation = await db.createVendorRfqInvitation({
              rfqId: input.rfqId,
              vendorId,
              status: 'pending',
              invitedAt: new Date(),
            });
            
            // Generate AI email content
            const emailPrompt = `Generate a professional Request for Quote (RFQ) email to a vendor for the following material:

RFQ Number: ${rfq.rfqNumber}
Material: ${rfq.materialName}
Description: ${rfq.materialDescription || 'N/A'}
Quantity Required: ${rfq.quantity} ${rfq.unit}
Specifications: ${rfq.specifications || 'Standard specifications'}
Required Delivery Date: ${rfq.requiredDeliveryDate ? new Date(rfq.requiredDeliveryDate).toLocaleDateString() : 'Flexible'}
Delivery Location: ${rfq.deliveryLocation || 'To be confirmed'}
Incoterms: ${rfq.incoterms || 'FOB'}
Priority: ${rfq.priority || 'Normal'}

Please request:
1. Unit price and total price
2. Lead time / delivery schedule
3. Minimum order quantity
4. Payment terms
5. Quote validity period

Request a response by ${rfq.quoteDueDate ? new Date(rfq.quoteDueDate).toLocaleDateString() : '5 business days'}.

Format the email professionally.`;

            const response = await invokeLLM({
              messages: [
                { role: 'system', content: 'You are a procurement specialist drafting RFQ emails to vendors. Be professional, clear, and include all relevant material details.' },
                { role: 'user', content: emailPrompt },
              ],
            });
            
            const rawEmailBody = response.choices[0]?.message?.content;
            const emailBody = typeof rawEmailBody === 'string' ? rawEmailBody : 'Unable to generate email content.';
            
            const emailSubject = `Request for Quote: ${rfq.rfqNumber} - ${rfq.materialName}`;
            let emailStatus: 'draft' | 'sent' | 'failed' = 'draft';
            let deliveryError: string | undefined;
            
            // Try to send via SendGrid if configured
            if (isEmailConfigured()) {
              const sendResult = await sendEmail({
                to: vendor.email,
                subject: emailSubject,
                text: emailBody,
                html: formatEmailHtml(emailBody),
              });
              
              if (sendResult.success) {
                emailStatus = 'sent';
                await db.updateVendorRfqInvitation(invitation.id, { status: 'sent' });
              } else {
                emailStatus = 'failed';
                deliveryError = sendResult.error;
              }
            }
            
            // Save the email record
            const emailResult = await db.createVendorRfqEmail({
              rfqId: input.rfqId,
              vendorId,
              direction: 'outbound',
              emailType: 'rfq_request',
              fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
              toEmail: vendor.email,
              subject: emailSubject,
              body: emailBody,
              aiGenerated: true,
              sendStatus: emailStatus,
              sentAt: emailStatus === 'sent' ? new Date() : undefined,
            });
            
            if (emailStatus === 'sent') {
              results.sent++;
            } else {
              results.failed++;
            }
            results.emails.push({ 
              vendorId, 
              vendorName: vendor.name, 
              emailId: emailResult.id,
              status: emailStatus,
              error: deliveryError,
            });
          }
          
          // Update RFQ status
          await db.updateVendorRfq(input.rfqId, { status: 'sent' });
          const emailConfigured = isEmailConfigured();
          const auditMessage = emailConfigured 
            ? `RFQ emails sent to ${results.sent} vendors` 
            : `RFQ email drafts created for ${results.sent + results.failed} vendors (SendGrid not configured)`;
          await createAuditLog(ctx.user.id, 'update', 'vendor_rfq', input.rfqId, auditMessage);
          
          return { ...results, emailConfigured };
        }),
      
      // Send follow-up reminder
      sendReminder: opsProcedure
        .input(z.object({ rfqId: z.number(), vendorId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const rfq = await db.getVendorRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'RFQ not found' });
          
          const vendor = await db.getVendorById(input.vendorId);
          if (!vendor || !vendor.email) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vendor not found or has no email' });
          
          const emailPrompt = `Generate a polite follow-up email for an RFQ that hasn't received a response:

RFQ Number: ${rfq.rfqNumber}
Material: ${rfq.materialName}
Quantity: ${rfq.quantity} ${rfq.unit}
Original Due Date: ${rfq.quoteDueDate ? new Date(rfq.quoteDueDate).toLocaleDateString() : 'N/A'}

Ask if they received the original request and if they can provide a quote.`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a procurement specialist sending a polite follow-up email.' },
              { role: 'user', content: emailPrompt },
            ],
          });
          
          const emailBody = typeof response.choices[0]?.message?.content === 'string' 
            ? response.choices[0].message.content 
            : 'Unable to generate email content.';
          
          const emailSubject = `Follow-up: RFQ ${rfq.rfqNumber} - ${rfq.materialName}`;
          let emailStatus: 'draft' | 'sent' | 'failed' = 'draft';
          
          if (isEmailConfigured()) {
            const sendResult = await sendEmail({
              to: vendor.email,
              subject: emailSubject,
              text: emailBody,
              html: formatEmailHtml(emailBody),
            });
            emailStatus = sendResult.success ? 'sent' : 'failed';
          }
          
          await db.createVendorRfqEmail({
            rfqId: input.rfqId,
            vendorId: input.vendorId,
            direction: 'outbound',
            emailType: 'follow_up',
            fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
            toEmail: vendor.email,
            subject: emailSubject,
            body: emailBody,
            aiGenerated: true,
            sendStatus: emailStatus,
            sentAt: emailStatus === 'sent' ? new Date() : undefined,
          });
          
          // Update invitation reminder count
          const invitations = await db.getVendorRfqInvitations(input.rfqId);
          const invitation = invitations.find(i => i.vendorId === input.vendorId);
          if (invitation) {
            await db.updateVendorRfqInvitation(invitation.id, {
              reminderSentAt: new Date(),
              reminderCount: (invitation.reminderCount || 0) + 1,
            });
          }
          
          return { success: true, emailStatus };
        }),
      
      // Get invitations for an RFQ
      getInvitations: protectedProcedure
        .input(z.object({ rfqId: z.number() }))
        .query(({ input }) => db.getVendorRfqInvitations(input.rfqId)),
    }),
    
    // Quotes
    quotes: router({
      list: protectedProcedure
        .input(z.object({ rfqId: z.number().optional(), vendorId: z.number().optional(), status: z.string().optional() }).optional())
        .query(({ input }) => db.getVendorQuotes(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getVendorQuoteById(input.id)),
      getWithVendorInfo: protectedProcedure
        .input(z.object({ rfqId: z.number() }))
        .query(({ input }) => db.getVendorQuotesWithVendorInfo(input.rfqId)),
      create: opsProcedure
        .input(z.object({
          rfqId: z.number(),
          vendorId: z.number(),
          quoteNumber: z.string().optional(),
          unitPrice: z.string().optional(),
          quantity: z.string().optional(),
          totalPrice: z.string().optional(),
          currency: z.string().optional(),
          shippingCost: z.string().optional(),
          handlingFee: z.string().optional(),
          taxAmount: z.string().optional(),
          otherCharges: z.string().optional(),
          totalWithCharges: z.string().optional(),
          leadTimeDays: z.number().optional(),
          estimatedDeliveryDate: z.date().optional(),
          minimumOrderQty: z.string().optional(),
          validUntil: z.date().optional(),
          paymentTerms: z.string().optional(),
          receivedVia: z.enum(['email', 'portal', 'phone', 'manual']).optional(),
          notes: z.string().optional(),
          incoterms: z.enum(INCOTERM_CODES).optional(),
          namedPlace: z.string().optional(),
          insuranceCost: z.string().optional(),
          customsDutyAmount: z.string().optional(),
          toolingCost: z.string().optional(),
          toolingAmortizationUnits: z.string().optional(),
          toolingIsRefundable: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createVendorQuote({ ...input, status: 'received' });
          
          // Update invitation status
          const invitations = await db.getVendorRfqInvitations(input.rfqId);
          const invitation = invitations.find(i => i.vendorId === input.vendorId);
          if (invitation) {
            await db.updateVendorRfqInvitation(invitation.id, { status: 'responded', respondedAt: new Date() });
          }
          
          // Check if all invited vendors have responded
          const updatedInvitations = await db.getVendorRfqInvitations(input.rfqId);
          const allResponded = updatedInvitations.every(i => ['responded', 'declined', 'no_response'].includes(i.status));
          if (allResponded && updatedInvitations.length > 0) {
            await db.updateVendorRfq(input.rfqId, { status: 'all_received' });
          } else {
            await db.updateVendorRfq(input.rfqId, { status: 'partially_received' });
          }
          
          // Legacy price-only rank, kept for callers that still read overallRank.
          const allQuotes = await db.getVendorQuotes({ rfqId: input.rfqId });
          const sortedQuotes = allQuotes
            .filter(q => q.status === 'received')
            .sort((a, b) => parseFloat(a.totalPrice || '999999') - parseFloat(b.totalPrice || '999999'));
          for (let i = 0; i < sortedQuotes.length; i++) {
            await db.updateVendorQuote(sortedQuotes[i].id, { overallRank: i + 1 });
          }

          // Landed-cost ranking on the RFQ's comparison basis.
          let normalization: Awaited<ReturnType<typeof normalizeQuotesForRfq>> | null = null;
          try {
            normalization = await normalizeQuotesForRfq(input.rfqId);
          } catch (e) {
            console.warn('[VendorQuotes] Normalization after quote entry failed:', e);
          }

          await createAuditLog(ctx.user.id, 'create', 'vendor_quote', result.id, `Quote from vendor ${input.vendorId}`);
          return {
            ...result,
            normalized: normalization?.results.find(r => r.quoteId === result.id) ?? null,
          };
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending', 'received', 'under_review', 'accepted', 'rejected', 'expired', 'converted_to_po']).optional(),
          unitPrice: z.string().optional(),
          quantity: z.string().optional(),
          totalPrice: z.string().optional(),
          leadTimeDays: z.number().optional(),
          validUntil: z.date().optional(),
          paymentTerms: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateVendorQuote(id, data);
          await createAuditLog(ctx.user.id, 'update', 'vendor_quote', id);
          return { success: true };
        }),
      
      // Accept quote and optionally convert to PO
      accept: opsProcedure
        .input(z.object({ id: z.number(), createPO: z.boolean().optional() }))
        .mutation(async ({ input, ctx }) => {
          const quote = await db.getVendorQuoteById(input.id);
          if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
          
          // Mark quote as accepted
          await db.updateVendorQuote(input.id, { status: 'accepted' });
          
          // Reject other quotes for this RFQ
          const otherQuotes = await db.getVendorQuotes({ rfqId: quote.rfqId });
          for (const q of otherQuotes) {
            if (q.id !== input.id && q.status === 'received') {
              await db.updateVendorQuote(q.id, { status: 'rejected' });
            }
          }
          
          // Update RFQ status
          await db.updateVendorRfq(quote.rfqId, { status: 'awarded' });
          
          // Send award notification email
          const vendor = await db.getVendorById(quote.vendorId);
          const rfq = await db.getVendorRfqById(quote.rfqId);
          if (vendor?.email && rfq && isEmailConfigured()) {
            const emailBody = `Dear ${vendor.name},\n\nWe are pleased to inform you that your quote for ${rfq.materialName} (RFQ: ${rfq.rfqNumber}) has been accepted.\n\nWe will be in touch shortly with a formal Purchase Order.\n\nThank you for your competitive pricing.\n\nBest regards`;
            await sendEmail({
              to: vendor.email,
              subject: `Quote Accepted: ${rfq.rfqNumber} - ${rfq.materialName}`,
              text: emailBody,
              html: formatEmailHtml(emailBody),
            });
            await db.createVendorRfqEmail({
              rfqId: quote.rfqId,
              vendorId: quote.vendorId,
              quoteId: input.id,
              direction: 'outbound',
              emailType: 'award_notification',
              fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
              toEmail: vendor.email,
              subject: `Quote Accepted: ${rfq.rfqNumber}`,
              body: emailBody,
              aiGenerated: false,
              sendStatus: 'sent',
              sentAt: new Date(),
            });
          }
          
          let poId: number | undefined;
          
          // Create PO if requested
          if (input.createPO && rfq) {
            const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const poResult = await db.createPurchaseOrder({
              poNumber,
              vendorId: quote.vendorId,
              status: 'draft',
              orderDate: new Date(),
              subtotal: quote.totalPrice || '0',
              totalAmount: quote.totalWithCharges || quote.totalPrice || '0',
              notes: `Created from accepted quote ${quote.quoteNumber || quote.id} for RFQ ${rfq.rfqNumber}`,
            });
            poId = poResult.id;
            
            // Add line item if raw material is linked
            if (rfq.rawMaterialId) {
              await db.createPurchaseOrderItem({
                purchaseOrderId: poResult.id,
                productId: null,
                description: rfq.materialName,
                quantity: quote.quantity || rfq.quantity || '1',
                unitPrice: quote.unitPrice || '0',
                totalAmount: quote.totalPrice || '0',
              });
            }
            
            // Update quote with PO reference
            await db.updateVendorQuote(input.id, { 
              status: 'converted_to_po',
              convertedToPOId: poResult.id,
              convertedAt: new Date(),
            });
            
            await createAuditLog(ctx.user.id, 'create', 'purchase_order', poResult.id, `Created from vendor quote ${input.id}`);
          }
          
          await createAuditLog(ctx.user.id, 'update', 'vendor_quote', input.id, 'Quote accepted');
          return { success: true, poId };
        }),
      
      // Reject quote
      reject: opsProcedure
        .input(z.object({ id: z.number(), reason: z.string().optional(), sendNotification: z.boolean().optional() }))
        .mutation(async ({ input, ctx }) => {
          const quote = await db.getVendorQuoteById(input.id);
          if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
          
          await db.updateVendorQuote(input.id, { status: 'rejected', notes: input.reason });
          
          // Send rejection notification if requested
          if (input.sendNotification) {
            const vendor = await db.getVendorById(quote.vendorId);
            const rfq = await db.getVendorRfqById(quote.rfqId);
            if (vendor?.email && rfq && isEmailConfigured()) {
              const emailBody = `Dear ${vendor.name},\n\nThank you for submitting your quote for ${rfq.materialName} (RFQ: ${rfq.rfqNumber}).\n\nAfter careful consideration, we have decided to proceed with another supplier for this order.${input.reason ? `\n\nReason: ${input.reason}` : ''}\n\nWe appreciate your time and look forward to future opportunities.\n\nBest regards`;
              await sendEmail({
                to: vendor.email,
                subject: `Quote Update: ${rfq.rfqNumber} - ${rfq.materialName}`,
                text: emailBody,
                html: formatEmailHtml(emailBody),
              });
              await db.createVendorRfqEmail({
                rfqId: quote.rfqId,
                vendorId: quote.vendorId,
                quoteId: input.id,
                direction: 'outbound',
                emailType: 'rejection_notification',
                fromEmail: process.env.SENDGRID_FROM_EMAIL || 'procurement@company.com',
                toEmail: vendor.email,
                subject: `Quote Update: ${rfq.rfqNumber}`,
                body: emailBody,
                aiGenerated: false,
                sendStatus: 'sent',
                sentAt: new Date(),
              });
            }
          }
          
          await createAuditLog(ctx.user.id, 'update', 'vendor_quote', input.id, 'Quote rejected');
          return { success: true };
        }),
      
      // Get best quote for an RFQ
      getBest: protectedProcedure
        .input(z.object({ rfqId: z.number() }))
        .query(({ input }) => db.getBestVendorQuote(input.rfqId)),
      
      // AI analyze and rank quotes
      analyzeAndRank: opsProcedure
        .input(z.object({ rfqId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          // Rank quotes by price
          const allQuotes = await db.getVendorQuotes({ rfqId: input.rfqId });
          const sortedQuotes = allQuotes
            .filter(q => q.status === 'received')
            .sort((a, b) => parseFloat(a.totalPrice || '999999') - parseFloat(b.totalPrice || '999999'));
          for (let i = 0; i < sortedQuotes.length; i++) {
            await db.updateVendorQuote(sortedQuotes[i].id, { overallRank: i + 1 });
          }
          await createAuditLog(ctx.user.id, 'update', 'vendor_rfq', input.rfqId, 'AI analyzed and ranked quotes');
          return { success: true };
        }),

      // Deterministic normalization only — no LLM.
      normalize: opsProcedure
        .input(z.object({ rfqId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const result = await normalizeQuotesForRfq(input.rfqId);
          await createAuditLog(
            ctx.user.id,
            'update',
            'vendor_rfq',
            input.rfqId,
            `Normalized ${result.results.length} quotes to ${result.basis.baseCurrency} / ${result.basis.targetIncoterm}`,
          );
          return result;
        }),

      // Side-by-side comparison payload for the UI.
      comparison: protectedProcedure
        .input(z.object({ rfqId: z.number() }))
        .query(async ({ input }) => {
          const rfq = await db.getVendorRfqById(input.rfqId);
          if (!rfq) throw new TRPCError({ code: 'NOT_FOUND', message: 'RFQ not found' });

          const quotes = await db.getVendorQuotes({ rfqId: input.rfqId });
          if (quotes.length === 0) {
            return { rfq, basis: basisFromRfq(rfq as any), rows: [], comparableCount: 0, excludedCount: 0 };
          }

          const normalization = await normalizeQuotesForRfq(input.rfqId, { persist: false });
          const normalizedById = new Map(normalization.results.map(r => [r.quoteId, r]));

          const vendorIds = Array.from(new Set(quotes.map(q => q.vendorId)));
          const vendorList = await db.getVendorsByIds(vendorIds);
          const vendorById = new Map(vendorList.map(v => [v.id, v]));

          const rows = quotes.map(q => ({
            quote: q,
            vendor: vendorById.get(q.vendorId) ?? null,
            normalized: normalizedById.get(q.id) ?? null,
          }));
          rows.sort((a, b) => {
            const ra = a.normalized?.rank ?? Number.MAX_SAFE_INTEGER;
            const rb = b.normalized?.rank ?? Number.MAX_SAFE_INTEGER;
            return ra - rb;
          });

          return {
            rfq,
            basis: normalization.basis,
            rows,
            comparableCount: normalization.comparableCount,
            excludedCount: normalization.excludedCount,
          };
        }),
    }),

    // Emails
    emails: router({
      list: protectedProcedure
        .input(z.object({ rfqId: z.number().optional(), vendorId: z.number().optional() }).optional())
        .query(({ input }) => db.getVendorRfqEmails(input)),

      // Parse an inbound vendor reply (body and/or attached quote sheet) into a
      // structured quote, match it to the RFQ, and level it.
      parseIncoming: opsProcedure
        .input(z.object({
          fromEmail: z.string().email(),
          fromName: z.string().optional(),
          subject: z.string(),
          body: z.string(),
          htmlBody: z.string().optional(),
          receivedAt: z.date().optional(),
          attachment: z.object({ fileUrl: z.string().url(), fileName: z.string() }).optional(),
          vendorId: z.number().optional(),
          rfqId: z.number().optional(),
          externalMessageId: z.string().optional(),
          threadId: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await ingestVendorQuoteEmail(input);
          if (result.quoteId) {
            await createAuditLog(
              ctx.user.id,
              'create',
              'vendor_quote',
              result.quoteId,
              `Parsed from vendor email: ${input.subject}`,
            );
          }
          return result;
        }),

      previewAttachment: opsProcedure
        .input(z.object({
          fileUrl: z.string().url(),
          fileName: z.string(),
          context: z.string().optional(),
        }))
        .mutation(({ input }) => parseVendorQuoteAttachment(input)),

      previewEmail: opsProcedure
        .input(z.object({
          subject: z.string(),
          body: z.string(),
          fromEmail: z.string().email().optional(),
          fromName: z.string().optional(),
        }))
        .mutation(({ input }) => parseVendorQuoteEmail(input)),
    }),

    // Measured vendor responsiveness on RFQs.
    responsiveness: router({
      byVendor: protectedProcedure
        .input(z.object({
          vendorId: z.number(),
          sinceDays: z.number().min(1).max(1095).optional(),
        }))
        .query(({ input }) =>
          computeVendorResponsiveness(input.vendorId, {
            since: input.sinceDays
              ? new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000)
              : undefined,
          }),
        ),

      leaderboard: protectedProcedure
        .input(z.object({ sinceDays: z.number().min(1).max(1095).optional() }).optional())
        .query(async ({ input }) => {
          const vendorList = await db.getVendors();
          const since = input?.sinceDays
            ? new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000)
            : undefined;
          const metrics = await computeResponsivenessForVendors(vendorList.map(v => v.id), { since });
          return vendorList
            .map(v => {
              const m = metrics.get(v.id);
              // `m` already carries vendorId.
              return m ? { vendorName: v.name, ...m, scoring: responsivenessScoreFromMetrics(m) } : null;
            })
            .filter((r): r is NonNullable<typeof r> => r !== null && r.invited > 0)
            .sort((a, b) => (b.scoring.score ?? -1) - (a.scoring.score ?? -1));
        }),

      closeStaleInvitations: opsProcedure
        .input(z.object({ graceDays: z.number().min(0).max(90).optional() }).optional())
        .mutation(({ input }) => markStaleInvitationsNoResponse({ graceDays: input?.graceDays })),
    }),
  }),
  // ============================================
  // SUPPLIER PORTAL (PUBLIC)
  // ============================================
  supplierPortal: router({
    getSession: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session) return null;
        if (new Date(session.expiresAt) < new Date()) {
          await db.updateSupplierPortalSession(session.id, { status: 'expired' });
          return null;
        }
        const po = await db.getPurchaseOrderWithItems(session.purchaseOrderId);
        return { ...session, purchaseOrder: po };
      }),
    getDocuments: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active' || new Date(session.expiresAt) < new Date()) return [];
        return db.getSupplierDocuments({ portalSessionId: session.id });
      }),
    getFreightInfo: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active' || new Date(session.expiresAt) < new Date()) return null;
        return db.getSupplierFreightInfo(session.purchaseOrderId);
      }),
    uploadDocument: publicProcedure
      .input(z.object({
        token: z.string(),
        documentType: z.string(),
        fileName: z.string(),
        fileData: z.string(), // base64
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid or expired session' });
        }
        // Upload to S3
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `supplier-docs/${session.purchaseOrderId}/${input.documentType}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType || 'application/octet-stream');
        // Save to database
        return db.createSupplierDocument({
          portalSessionId: session.id,
          purchaseOrderId: session.purchaseOrderId,
          vendorId: session.vendorId,
          documentType: input.documentType,
          fileName: input.fileName,
          fileUrl: url,
          fileSize: buffer.length,
          mimeType: input.mimeType,
        });
      }),
    saveFreightInfo: publicProcedure
      .input(z.object({
        token: z.string(),
        totalPackages: z.number().optional(),
        totalGrossWeight: z.string().optional(),
        totalNetWeight: z.string().optional(),
        weightUnit: z.string().optional(),
        totalVolume: z.string().optional(),
        volumeUnit: z.string().optional(),
        packageDimensions: z.string().optional(),
        hsCodes: z.string().optional(),
        preferredShipDate: z.date().optional(),
        preferredCarrier: z.string().optional(),
        incoterms: z.string().optional(),
        specialInstructions: z.string().optional(),
        hasDangerousGoods: z.boolean().optional(),
        dangerousGoodsClass: z.string().optional(),
        unNumber: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid or expired session' });
        }
        const { token, ...data } = input;
        const existing = await db.getSupplierFreightInfo(session.purchaseOrderId);
        if (existing) {
          await db.updateSupplierFreightInfo(existing.id, data);
          return { success: true, id: existing.id };
        } else {
          const result = await db.createSupplierFreightInfo({
            portalSessionId: session.id,
            purchaseOrderId: session.purchaseOrderId,
            vendorId: session.vendorId,
            ...data,
          });
          return { success: true, id: result.id };
        }
      }),
    completeSubmission: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const session = await db.getSupplierPortalSession(input.token);
        if (!session || session.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid or expired session' });
        }
        await db.updateSupplierPortalSession(session.id, { status: 'completed', completedAt: new Date() });
        // Update PO status
        await db.updatePurchaseOrder(session.purchaseOrderId, { status: 'confirmed' });
        return { success: true };
      }),
  }),
  // ============================================
  // DOCUMENT IMPORT
  // ============================================
  documentImport: router({
    // Parse uploaded document to extract data
    parse: protectedProcedure
      .input(z.object({
        fileData: z.string(), // base64 encoded file
        fileName: z.string(),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Upload to S3 first
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `document-imports/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType || 'application/octet-stream');
        
        // Determine the mime type for LLM
        const mimeType = input.mimeType || 'application/pdf';
        
        // Parse the document using LLM with file_url
        const result = await parseUploadedDocument(url, input.fileName, undefined, mimeType);
        return { ...result, fileUrl: url };
      }),

    // Import a purchase order
    importPO: protectedProcedure
      .input(z.object({
        poData: z.object({
          poNumber: z.string(),
          vendorName: z.string(),
          vendorEmail: z.string().optional(),
          orderDate: z.string(),
          deliveryDate: z.string().optional(),
          subtotal: z.number(),
          totalAmount: z.number(),
          notes: z.string().optional(),
          status: z.string().optional(),
          lineItems: z.array(z.object({
            description: z.string(),
            sku: z.string().optional(),
            quantity: z.number(),
            unit: z.string().optional(),
            unitPrice: z.number(),
            totalPrice: z.number(),
          })),
        }),
        markAsReceived: z.boolean().default(false),
        updateInventory: z.boolean().default(true),
        createMissingVendor: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        return importPurchaseOrder(input.poData as any, ctx.user.id, input.markAsReceived, input.createMissingVendor);
      }),

    // Import a freight invoice
    importFreightInvoice: protectedProcedure
      .input(z.object({
        invoiceData: z.object({
          invoiceNumber: z.string(),
          carrierName: z.string(),
          carrierEmail: z.string().optional(),
          invoiceDate: z.string(),
          shipmentDate: z.string().optional(),
          deliveryDate: z.string().optional(),
          origin: z.string().optional(),
          destination: z.string().optional(),
          trackingNumber: z.string().optional(),
          weight: z.string().optional(),
          dimensions: z.string().optional(),
          freightCharges: z.number(),
          fuelSurcharge: z.number().optional(),
          accessorialCharges: z.number().optional(),
          totalAmount: z.number(),
          currency: z.string().optional(),
          relatedPoNumber: z.string().optional(),
          notes: z.string().optional(),
        }),
        linkToPO: z.boolean().default(true),
        createMissingVendor: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        return importFreightInvoice(input.invoiceData as any, ctx.user.id, input.createMissingVendor);
      }),

    // Import a vendor invoice
    importVendorInvoice: protectedProcedure
      .input(z.object({
        invoiceData: z.object({
          invoiceNumber: z.string(),
          vendorName: z.string(),
          vendorEmail: z.string().optional(),
          invoiceDate: z.string(),
          dueDate: z.string().optional(),
          lineItems: z.array(z.object({
            description: z.string(),
            sku: z.string().optional(),
            quantity: z.number(),
            unit: z.string().optional(),
            unitPrice: z.number(),
            totalPrice: z.number(),
          })),
          subtotal: z.number(),
          taxAmount: z.number().optional(),
          shippingAmount: z.number().optional(),
          totalAmount: z.number(),
          currency: z.string().optional(),
          relatedPoNumber: z.string().optional(),
          paymentTerms: z.string().optional(),
          notes: z.string().optional(),
        }),
        markAsReceived: z.boolean().default(false),
        updateInventory: z.boolean().default(true),
        createMissingVendor: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        return importVendorInvoice(input.invoiceData as any, ctx.user.id, input.markAsReceived, input.createMissingVendor);
      }),

    // Import a customs document
    importCustomsDocument: protectedProcedure
      .input(z.object({
        documentData: z.object({
          documentNumber: z.string(),
          documentType: z.enum(["bill_of_lading", "customs_entry", "commercial_invoice", "packing_list", "certificate_of_origin", "import_permit", "other"]),
          entryDate: z.string(),
          shipperName: z.string(),
          shipperCountry: z.string().optional(),
          consigneeName: z.string(),
          consigneeCountry: z.string().optional(),
          countryOfOrigin: z.string(),
          portOfEntry: z.string().optional(),
          portOfExit: z.string().optional(),
          vesselName: z.string().optional(),
          voyageNumber: z.string().optional(),
          containerNumber: z.string().optional(),
          lineItems: z.array(z.object({
            description: z.string(),
            hsCode: z.string().optional(),
            quantity: z.number(),
            unit: z.string().optional(),
            declaredValue: z.number(),
            dutyRate: z.number().optional(),
            dutyAmount: z.number().optional(),
            countryOfOrigin: z.string().optional(),
          })),
          totalDeclaredValue: z.number(),
          totalDuties: z.number().optional(),
          totalTaxes: z.number().optional(),
          totalCharges: z.number(),
          currency: z.string().optional(),
          brokerName: z.string().optional(),
          brokerReference: z.string().optional(),
          relatedPoNumber: z.string().optional(),
          trackingNumber: z.string().optional(),
          notes: z.string().optional(),
        }),
        linkToPO: z.boolean().default(true),
        createMissingVendor: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        return importCustomsDocument(input.documentData as any, ctx.user.id, input.createMissingVendor);
      }),

    // Get import history
    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ input }) => {
        return db.getDocumentImportLogs(input.limit);
      }),

    // Match line items to existing materials
    matchMaterials: protectedProcedure
      .input(z.object({
        lineItems: z.array(z.object({
          description: z.string(),
          sku: z.string().optional(),
          quantity: z.number(),
          unit: z.string().optional(),
          unitPrice: z.number(),
          totalPrice: z.number(),
        })),
      }))
      .mutation(async ({ input }) => {
        return matchLineItemsToMaterials(input.lineItems);
      }),

    // List folders from Google Drive
    listDriveFolders: protectedProcedure
      .input(z.object({ 
        parentFolderId: z.string().optional(),
        pageToken: z.string().optional() 
      }).optional())
      .query(async ({ ctx, input }) => {
        const token = await db.getGoogleOAuthToken(ctx.user.id);
        if (!token) {
          // Return empty result instead of throwing error
          return { folders: [], nextPageToken: undefined, notConnected: true };
        }
        
        // Refresh token if needed
        let accessToken = token.accessToken;
        if (token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          
          if (clientId && clientSecret) {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: token.refreshToken,
                grant_type: 'refresh_token',
              }),
            });
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              await db.upsertGoogleOAuthToken({
                userId: ctx.user.id,
                accessToken: refreshData.access_token,
                expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
              });
            }
          }
        }
        
        // Build query for folders
        const parentQuery = input?.parentFolderId 
          ? `'${input.parentFolderId}' in parents` 
          : `'root' in parents`;
        const query = `mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;
        
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&orderBy=name&pageSize=100${input?.pageToken ? `&pageToken=${input.pageToken}` : ''}`;
        
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Google token expired. Please reconnect your account.' });
          }
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list folders' });
        }
        
        const data = await response.json();
        return {
          folders: data.files || [],
          nextPageToken: data.nextPageToken,
          notConnected: false,
        };
      }),

    // List files in a Google Drive folder (PDFs, Excel, CSV, images)
    listDriveFiles: protectedProcedure
      .input(z.object({ 
        folderId: z.string(),
        pageToken: z.string().optional() 
      }))
      .query(async ({ ctx, input }) => {
        const token = await db.getGoogleOAuthToken(ctx.user.id);
        if (!token) {
          // Return empty result instead of throwing error
          return { files: [], nextPageToken: undefined, notConnected: true };
        }
        
        // Refresh token if needed
        let accessToken = token.accessToken;
        if (token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          
          if (clientId && clientSecret) {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: token.refreshToken,
                grant_type: 'refresh_token',
              }),
            });
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              await db.upsertGoogleOAuthToken({
                userId: ctx.user.id,
                accessToken: refreshData.access_token,
                expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
              });
            }
          }
        }
        
        // Query for supported file types
        const mimeTypes = [
          "mimeType='application/pdf'",
          "mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
          "mimeType='application/vnd.ms-excel'",
          "mimeType='text/csv'",
          "mimeType='image/jpeg'",
          "mimeType='image/png'",
        ].join(' or ');
        const query = `'${input.folderId}' in parents and (${mimeTypes}) and trashed=false`;
        
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&orderBy=name&pageSize=100${input.pageToken ? `&pageToken=${input.pageToken}` : ''}`;
        
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Google token expired. Please reconnect your account.' });
          }
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list files' });
        }
        
        const data = await response.json();
        return {
          files: data.files || [],
          nextPageToken: data.nextPageToken,
          notConnected: false,
        };
      }),

    // Download and parse a file from Google Drive
    parseFromDrive: protectedProcedure
      .input(z.object({
        fileId: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const token = await db.getGoogleOAuthToken(ctx.user.id);
        if (!token) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Google account not connected. Please connect your Google account first.' });
        }
        
        // Refresh token if needed
        let accessToken = token.accessToken;
        if (token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          
          if (clientId && clientSecret) {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: token.refreshToken,
                grant_type: 'refresh_token',
              }),
            });
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              await db.upsertGoogleOAuthToken({
                userId: ctx.user.id,
                accessToken: refreshData.access_token,
                expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
              });
            }
          }
        }
        
        // Download file content
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${input.fileId}?alt=media`;
        const response = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to download file from Google Drive' });
        }
        
        const buffer = Buffer.from(await response.arrayBuffer());
        
        // Upload to S3
        const fileKey = `document-imports/gdrive-${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        // Parse the document
        const result = await parseUploadedDocument(url, input.fileName);
        return { ...result, fileUrl: url, sourceFileId: input.fileId };
      }),

    // Batch parse multiple files from Google Drive
    batchParseFromDrive: protectedProcedure
      .input(z.object({
        files: z.array(z.object({
          fileId: z.string(),
          fileName: z.string(),
          mimeType: z.string(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const token = await db.getGoogleOAuthToken(ctx.user.id);
        if (!token) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Google account not connected. Please connect your Google account first.' });
        }
        
        // Refresh token if needed
        let accessToken = token.accessToken;
        if (token.expiresAt && new Date(token.expiresAt) < new Date() && token.refreshToken) {
          const clientId = process.env.GOOGLE_CLIENT_ID;
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
          
          if (clientId && clientSecret) {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: token.refreshToken,
                grant_type: 'refresh_token',
              }),
            });
            
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              await db.upsertGoogleOAuthToken({
                userId: ctx.user.id,
                accessToken: refreshData.access_token,
                expiresAt: new Date(Date.now() + refreshData.expires_in * 1000),
              });
            }
          }
        }
        
        const results: Array<{
          fileId: string;
          fileName: string;
          success: boolean;
          data?: any;
          error?: string;
        }> = [];
        
        for (const file of input.files) {
          try {
            // Download file content
            const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.fileId}?alt=media`;
            const response = await fetch(downloadUrl, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            
            if (!response.ok) {
              results.push({
                fileId: file.fileId,
                fileName: file.fileName,
                success: false,
                error: 'Failed to download file',
              });
              continue;
            }
            
            const buffer = Buffer.from(await response.arrayBuffer());
            
            // Upload to S3
            const fileKey = `document-imports/gdrive-${Date.now()}-${file.fileName}`;
            const { url } = await storagePut(fileKey, buffer, file.mimeType);
            
            // Parse the document
            const parseResult = await parseUploadedDocument(url, file.fileName);
            
            results.push({
              fileId: file.fileId,
              fileName: file.fileName,
              success: true,
              data: { ...parseResult, fileUrl: url },
            });
          } catch (error: any) {
            results.push({
              fileId: file.fileId,
              fileName: file.fileName,
              success: false,
              error: error.message || 'Unknown error',
            });
          }
        }
        
        return { results };
      }),
  }),
  // ============================================
  // AUTOMATED VENDOR NEGOTIATIONS
  // ============================================
  vendorNegotiations: router({
    list: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        vendorId: z.number().optional(),
        status: z.string().optional(),
        type: z.string().optional(),
        assignedTo: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getVendorNegotiations(input)),
    get: opsProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const negotiation = await db.getVendorNegotiationById(input.id);
        const rounds = negotiation ? await db.getNegotiationRounds(input.id) : [];
        return { negotiation, rounds };
      }),
    create: opsProcedure
      .input(z.object({
        companyId: z.number().optional(),
        vendorId: z.number(),
        title: z.string(),
        type: z.enum(["price_reduction", "volume_discount", "payment_terms", "lead_time", "contract_renewal", "new_contract"]),
        productIds: z.array(z.number()).optional(),
        rawMaterialIds: z.array(z.number()).optional(),
        currentUnitPrice: z.number().optional(),
        currentPaymentTerms: z.number().optional(),
        currentLeadTimeDays: z.number().optional(),
        currentMinOrderAmount: z.number().optional(),
        currentAnnualVolume: z.number().optional(),
        autoAnalyze: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await initiateNegotiation({ ...input, initiatedBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'vendorNegotiation', result.id);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "analyzing", "ready", "in_progress", "counter_offered", "accepted", "rejected", "expired"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        targetUnitPrice: z.coerce.number().optional(),
        targetPaymentTerms: z.number().optional(),
        targetLeadTimeDays: z.number().optional(),
        targetMinOrderAmount: z.coerce.number().optional(),
        targetAnnualVolume: z.coerce.number().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateVendorNegotiation(id, data as any);
        await createAuditLog(ctx.user.id, 'update', 'vendorNegotiation', id);
        return { success: true };
      }),
    analyze: opsProcedure
      .input(z.object({
        vendorId: z.number(),
        productIds: z.array(z.number()).optional(),
        negotiationType: z.string(),
      }))
      .mutation(({ input }) => analyzeNegotiationOpportunity(input)),
    addRound: opsProcedure
      .input(z.object({
        negotiationId: z.number(),
        direction: z.enum(["outbound", "inbound"]),
        messageType: z.enum(["initial_offer", "counter_offer", "acceptance", "rejection", "info_request", "final_offer"]),
        proposedUnitPrice: z.number().optional(),
        proposedPaymentTerms: z.number().optional(),
        proposedLeadTimeDays: z.number().optional(),
        proposedMinOrderAmount: z.number().optional(),
        proposedVolume: z.number().optional(),
        messageContent: z.string().optional(),
        generateAiDraft: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await addNegotiationRound({ ...input, sentBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'negotiationRound', result.id);
        return result;
      }),
    generateDraft: opsProcedure
      .input(z.object({
        negotiationId: z.number(),
        roundNumber: z.number(),
        messageType: z.enum(["initial_offer", "counter_offer", "final_offer", "acceptance", "rejection"]),
      }))
      .mutation(({ input }) => generateNegotiationDraft(input)),
    rounds: opsProcedure
      .input(z.object({ negotiationId: z.number() }))
      .query(({ input }) => db.getNegotiationRounds(input.negotiationId)),
    stats: opsProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getVendorNegotiationStats(input?.companyId)),
  }),
});
