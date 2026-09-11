// appRouter.copackerPortal — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { sendEmail } from "../_core/email";
import { addCostLayer } from "../inventoryCostingService";
import * as db from "../db";
import * as manufacturingDb from "../db/manufacturing";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { copackerProcedure, createAuditLog } from "./_shared";

// Copacker Portal - restricted views for copackers
export const copackerPortalRouter = router({
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

    // Get customs clearances accessible to copacker
    getCustomsClearances: copackerProcedure.query(async ({ ctx }) => {
      const allClearances = await db.getCustomsClearances();
      if (ctx.user.role === 'copacker') {
        const allShipments = await db.getShipments();
        const shipmentIds = new Set(allShipments.map(s => s.id));
        return allClearances.filter(c => c.shipmentId != null && shipmentIds.has(c.shipmentId));
      }
      return allClearances;
    }),

    // Get customs documents for a specific clearance (copacker access check)
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

    // --- Biweekly Inventory Updates ---

    // Get biweekly inventory update submissions
    getInventoryUpdates: copackerProcedure.query(async ({ ctx }) => {
      const warehouseId = ctx.user.role === 'copacker' ? ctx.user.linkedWarehouseId! : undefined;
      return db.getCopackerInventoryUpdates(warehouseId ?? undefined);
    }),

    // Get a single inventory update with its line items
    getInventoryUpdateDetail: copackerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const update = await db.getCopackerInventoryUpdateById(input.id);
        if (!update) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inventory update not found' });

        if (ctx.user.role === 'copacker' && ctx.user.linkedWarehouseId && update.warehouseId !== ctx.user.linkedWarehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const items = await db.getCopackerInventoryUpdateItems(input.id);
        return { update, items };
      }),

    // Create a new biweekly inventory update (draft)
    createInventoryUpdate: copackerProcedure
      .input(z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        notes: z.string().optional(),
        items: z.array(z.object({
          productId: z.number(),
          previousQuantity: z.string().optional(),
          newQuantity: z.string(),
          quantityReceived: z.string().optional(),
          quantityShipped: z.string().optional(),
          quantityDamaged: z.string().optional(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user.linkedWarehouseId) {
          // For admin/ops users without a warehouse, use the first available warehouse
          const locations = await db.getWarehouses();
          if (!locations || locations.length === 0) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No warehouses configured. Create a location first.' });
          }
          // Use first warehouse as default for admin users
          ctx.user.linkedWarehouseId = locations[0].id;
        }

        const warehouseId = ctx.user.linkedWarehouseId;
        const { items, ...updateData } = input;

        const result = await db.createCopackerInventoryUpdate({
          warehouseId,
          submittedBy: ctx.user.id,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          status: 'draft',
          notes: updateData.notes,
        });

        for (const item of items) {
          await db.createCopackerInventoryUpdateItem({
            updateId: result.id,
            productId: item.productId,
            previousQuantity: item.previousQuantity,
            newQuantity: item.newQuantity,
            quantityReceived: item.quantityReceived || "0",
            quantityShipped: item.quantityShipped || "0",
            quantityDamaged: item.quantityDamaged || "0",
            notes: item.notes,
          });
        }

        await createAuditLog(ctx.user.id, 'create', 'copacker_inventory_update', result.id);
        return { id: result.id };
      }),

    // Submit a draft inventory update
    submitInventoryUpdate: copackerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const update = await db.getCopackerInventoryUpdateById(input.id);
        if (!update) throw new TRPCError({ code: 'NOT_FOUND' });
        if (ctx.user.role === 'copacker' && ctx.user.linkedWarehouseId && update.warehouseId !== ctx.user.linkedWarehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        await db.updateCopackerInventoryUpdate(input.id, { status: 'submitted' });

        // Apply inventory quantities to actual inventory table
        const items = await db.getCopackerInventoryUpdateItems(input.id);
        for (const row of items) {
          const invItems = await db.getInventoryByWarehouse(update.warehouseId);
          const match = invItems.find((i: any) => i.inventory.productId === (row as any).productId);
          if (match) {
            await db.updateInventoryQuantityById(
              match.inventory.id,
              parseFloat((row as any).newQuantity),
              ctx.user.id,
              `Biweekly update #${input.id}`
            );
          }
        }

        await createAuditLog(ctx.user.id, 'update', 'copacker_inventory_update', input.id, undefined, undefined, { status: 'submitted' });
        return { success: true };
      }),

    // --- Copacker Invoices ---

    getInvoices: copackerProcedure.query(async ({ ctx }) => {
      const warehouseId = ctx.user.role === 'copacker' ? ctx.user.linkedWarehouseId! : undefined;
      return db.getCopackerInvoices(warehouseId ?? undefined);
    }),

    getInvoiceDetail: copackerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const invoice = await db.getCopackerInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
        if (ctx.user.role === 'copacker' && ctx.user.linkedWarehouseId && invoice.warehouseId !== ctx.user.linkedWarehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const items = await db.getCopackerInvoiceItems(input.id);
        return { invoice, items };
      }),

    createInvoice: copackerProcedure
      .input(z.object({
        invoiceNumber: z.string().min(1),
        invoiceDate: z.string(),
        dueDate: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
          description: z.string(),
          quantity: z.string(),
          unitPrice: z.string(),
          totalAmount: z.string(),
        })),
        fileName: z.string().optional(),
        fileData: z.string().optional(),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === 'copacker' && !ctx.user.linkedWarehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No warehouse assigned' });
        }

        const warehouseId = ctx.user.linkedWarehouseId!;
        const { items, fileName, fileData, mimeType, ...invoiceData } = input;

        const subtotal = items.reduce((sum, i) => sum + parseFloat(i.totalAmount), 0);
        const totalAmount = subtotal;

        let fileUrl: string | undefined;
        let fileKey: string | undefined;

        if (fileData && fileName && mimeType) {
          const buffer = Buffer.from(fileData, 'base64');
          fileKey = `copacker-invoices/${warehouseId}/${nanoid()}-${fileName}`;
          const uploaded = await storagePut(fileKey, buffer, mimeType);
          fileUrl = uploaded.url;
        }

        const result = await db.createCopackerInvoice({
          warehouseId,
          submittedBy: ctx.user.id,
          invoiceNumber: invoiceData.invoiceNumber,
          invoiceDate: new Date(invoiceData.invoiceDate),
          dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : undefined,
          description: invoiceData.description,
          subtotal: subtotal.toFixed(2),
          taxAmount: "0",
          totalAmount: totalAmount.toFixed(2),
          status: 'submitted',
          fileUrl,
          fileKey,
          fileName,
          mimeType,
          notes: invoiceData.notes,
        });

        for (const item of items) {
          await db.createCopackerInvoiceItem({
            invoiceId: result.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.totalAmount,
          });
        }

        await createAuditLog(ctx.user.id, 'create', 'copacker_invoice', result.id, invoiceData.invoiceNumber);

        // Auto-allocate copacker fees to product cost layers as overhead
        try {
          if (totalAmount > 0) {
            const activeLayers = await db.getInventoryCostLayers({
              warehouseId,
              status: 'active',
            });

            if (activeLayers.length > 0) {
              // Group layers by productId and sum remaining quantities
              const productQtyMap = new Map<number, number>();
              for (const layer of activeLayers) {
                const pid = layer.productId;
                const qty = parseFloat(layer.remainingQuantity?.toString() || '0');
                productQtyMap.set(pid, (productQtyMap.get(pid) || 0) + qty);
              }

              const grandTotalQty = Array.from(productQtyMap.values()).reduce((a, b) => a + b, 0);

              if (grandTotalQty > 0) {
                const { addCostLayer } = await import("../inventoryCostingService");
                for (const [productId, productQty] of productQtyMap) {
                  if (productQty > 0) {
                    const copackerCostPerUnit = (totalAmount * (productQty / grandTotalQty)) / productQty;
                    await addCostLayer({
                      productId,
                      warehouseId,
                      quantity: productQty,
                      unitCost: copackerCostPerUnit,
                      referenceType: "copacker_invoice",
                      referenceId: result.id,
                      notes: `Copacker fee allocation from invoice ${invoiceData.invoiceNumber}`,
                      createdBy: ctx.user.id,
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn("[COGS] Failed to allocate copacker fees to cost layers:", e);
        }

        return { id: result.id };
      }),

    // --- Copacker Shipping Documents ---

    getShippingDocuments: copackerProcedure.query(async ({ ctx }) => {
      const warehouseId = ctx.user.role === 'copacker' ? ctx.user.linkedWarehouseId! : undefined;
      return db.getCopackerShippingDocuments(warehouseId ?? undefined);
    }),

    uploadShippingDocument: copackerProcedure
      .input(z.object({
        shipmentId: z.number().optional(),
        documentType: z.enum([
          'bill_of_lading', 'packing_list', 'commercial_invoice', 'proof_of_delivery',
          'weight_certificate', 'inspection_report', 'customs_declaration', 'other'
        ]),
        name: z.string(),
        description: z.string().optional(),
        fileData: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === 'copacker' && !ctx.user.linkedWarehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No warehouse assigned' });
        }

        const warehouseId = ctx.user.linkedWarehouseId!;
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `copacker-shipping/${warehouseId}/${nanoid()}-${input.name}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        const result = await db.createCopackerShippingDocument({
          warehouseId,
          shipmentId: input.shipmentId,
          uploadedBy: ctx.user.id,
          documentType: input.documentType,
          name: input.name,
          description: input.description,
          fileUrl: url,
          fileKey,
          fileSize: buffer.length,
          mimeType: input.mimeType,
          status: 'uploaded',
        });

        await createAuditLog(ctx.user.id, 'create', 'copacker_shipping_document', result.id, input.name);
        return { id: result.id, url };
      }),

    // --- Shared recipes (read-only view of recipes shared with this copacker) ---
    getSharedRecipes: copackerProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === 'copacker' && !ctx.user.linkedWarehouseId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'No warehouse assigned to this account' });
      }
      // Admin/ops viewing the portal see nothing unless they're linked to a warehouse.
      const warehouseId = ctx.user.linkedWarehouseId;
      if (!warehouseId) return [];
      return manufacturingDb.getRecipesSharedWithWarehouse(warehouseId);
    }),

    getSharedRecipeDetail: copackerProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input, ctx }) => {
        const warehouseId = ctx.user.linkedWarehouseId;
        if (ctx.user.role === 'copacker' && !warehouseId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No warehouse assigned to this account' });
        }
        // Gate by share row unless caller is admin/ops.
        let share = warehouseId
          ? await manufacturingDb.getRecipeShareForWarehouse(input.recipeId, warehouseId)
          : undefined;
        if (ctx.user.role === 'copacker' && !share) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'This recipe is not shared with your facility' });
        }
        const recipe = await manufacturingDb.getRecipeById(input.recipeId);
        if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found' });

        const shareIngredients = share?.shareIngredients ?? true;
        const shareProcedures = share?.shareProcedures ?? true;

        const lines = shareIngredients
          ? await manufacturingDb.getRecipeLines(input.recipeId)
          : [];
        const procedures = shareProcedures
          ? await manufacturingDb.getRecipeProcedures(input.recipeId)
          : [];
        return {
          recipe,
          share: share ?? null,
          lines,
          procedures,
          shareIngredients,
          shareProcedures,
        };
      }),

    // Get current biweekly period info
    getCurrentPeriod: copackerProcedure.query(async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const day = now.getDate();

      // Biweekly periods: 1st-15th and 16th-end of month
      let periodStart: Date;
      let periodEnd: Date;

      if (day <= 15) {
        periodStart = new Date(year, month, 1);
        periodEnd = new Date(year, month, 15, 23, 59, 59);
      } else {
        periodStart = new Date(year, month, 16);
        periodEnd = new Date(year, month + 1, 0, 23, 59, 59);
      }

      const daysLeft = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isDue = daysLeft <= 3;

      return {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        daysLeft,
        isDue,
        periodLabel: day <= 15
          ? `${periodStart.toLocaleDateString('en-US', { month: 'short' })} 1-15, ${year}`
          : `${periodStart.toLocaleDateString('en-US', { month: 'short' })} 16-${periodEnd.getDate()}, ${year}`,
      };
    }),

    // --- Upload Invoice (AI-parsed, auto-emailed to AP) ---
    uploadInvoice: copackerProcedure
      .input(z.object({
        fileName: z.string(),
        fileData: z.string(), // base64 encoded
        mimeType: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 1. Decode and store the file
        const buffer = Buffer.from(input.fileData, 'base64');
        const fileKey = `copacker-invoices/${ctx.user.id}/${nanoid()}-${input.fileName}`;

        let fileUrl = '';
        try {
          const uploaded = await storagePut(fileKey, buffer, input.mimeType);
          fileUrl = uploaded.url;
        } catch {
          // Storage not configured, skip file storage
          fileUrl = `local:${fileKey}`;
        }

        // 2. Parse the document using AI
        let parsedData: Record<string, any> = {};
        try {
          const base64Data = input.fileData;
          const parsePrompt = 'Parse this invoice document and extract: invoiceNumber, vendorName, invoiceDate (YYYY-MM-DD), dueDate (YYYY-MM-DD), lineItems (array of {description, quantity, unitPrice, totalAmount}), subtotal, taxAmount, totalAmount. Return as JSON only.';

          // Build multimodal message content
          const contentParts: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string }; file_url?: { url: string; mime_type?: string } }> = [
            { type: 'text', text: parsePrompt },
          ];

          if (input.mimeType.startsWith('image/')) {
            contentParts.push({
              type: 'image_url',
              image_url: { url: `data:${input.mimeType};base64,${base64Data}`, detail: 'high' },
            });
          } else if (input.mimeType === 'application/pdf') {
            contentParts.push({
              type: 'file_url',
              file_url: { url: `data:application/pdf;base64,${base64Data}`, mime_type: 'application/pdf' },
            });
          }

          const llmResult = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are an invoice parser. Extract data from the uploaded invoice and return valid JSON only. No markdown, no explanation.' },
              { role: 'user', content: contentParts as any },
            ],
            maxTokens: 4096,
          });

          const rawText = typeof llmResult.choices?.[0]?.message?.content === 'string'
            ? llmResult.choices[0].message.content
            : '';
          try {
            parsedData = JSON.parse(rawText.replace(/```json\n?|\n?```/g, '').trim());
          } catch {
            parsedData = { raw: rawText };
          }
        } catch (e) {
          console.warn('[Copacker Invoice] AI parsing failed:', e);
        }

        // 3. Create copacker invoice record
        const warehouseId = ctx.user.linkedWarehouseId || 1;
        const invoiceResult = await db.createCopackerInvoice({
          warehouseId,
          submittedBy: ctx.user.id,
          invoiceNumber: parsedData.invoiceNumber || `INV-${Date.now().toString(36).toUpperCase()}`,
          invoiceDate: parsedData.invoiceDate ? new Date(parsedData.invoiceDate) : new Date(),
          dueDate: parsedData.dueDate ? new Date(parsedData.dueDate) : undefined,
          description: input.notes || parsedData.description || 'Copacker invoice (AI-parsed)',
          subtotal: parsedData.subtotal?.toString() || parsedData.totalAmount?.toString() || '0',
          taxAmount: parsedData.taxAmount?.toString() || '0',
          totalAmount: parsedData.totalAmount?.toString() || '0',
          status: 'submitted',
          fileUrl,
          fileKey,
          fileName: input.fileName,
          mimeType: input.mimeType,
          notes: input.notes,
        });

        // 4. Create line items if parsed
        if (parsedData.lineItems && Array.isArray(parsedData.lineItems)) {
          for (const item of parsedData.lineItems) {
            await db.createCopackerInvoiceItem({
              invoiceId: invoiceResult.id,
              description: item.description || 'Line item',
              quantity: item.quantity?.toString() || '1',
              unitPrice: item.unitPrice?.toString() || '0',
              totalAmount: item.totalAmount?.toString() || '0',
            });
          }
        }

        // 5. Email to AP (superhumn@ap.mercury.com)
        try {
          const userName = ctx.user.name || 'Copacker';

          await sendEmail({
            to: 'superhumn@ap.mercury.com',
            subject: `Copacker Invoice ${parsedData.invoiceNumber || invoiceResult.id} from ${userName}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px;">
                <h2>Copacker Invoice Received</h2>
                <p><strong>From:</strong> ${userName}</p>
                <p><strong>Invoice #:</strong> ${parsedData.invoiceNumber || invoiceResult.id}</p>
                <p><strong>Date:</strong> ${parsedData.invoiceDate || new Date().toLocaleDateString()}</p>
                <p><strong>Amount:</strong> $${parsedData.totalAmount || '0.00'}</p>
                ${input.notes ? `<p><strong>Notes:</strong> ${input.notes}</p>` : ''}
                ${parsedData.lineItems ? `
                  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                    <tr style="border-bottom: 2px solid #333;">
                      <th style="text-align: left; padding: 8px;">Description</th>
                      <th style="text-align: right; padding: 8px;">Qty</th>
                      <th style="text-align: right; padding: 8px;">Rate</th>
                      <th style="text-align: right; padding: 8px;">Amount</th>
                    </tr>
                    ${parsedData.lineItems.map((item: any) => `
                      <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px;">${item.description}</td>
                        <td style="text-align: right; padding: 8px;">${item.quantity}</td>
                        <td style="text-align: right; padding: 8px;">$${item.unitPrice}</td>
                        <td style="text-align: right; padding: 8px;">$${item.totalAmount}</td>
                      </tr>
                    `).join('')}
                  </table>
                ` : ''}
                <p style="margin-top: 16px; font-size: 18px;"><strong>Total: $${parsedData.totalAmount || '0.00'}</strong></p>
                <p style="color: #888; font-size: 12px;">Submitted via Superhumn ERP Copacker Portal</p>
              </div>
            `,
            attachments: [{
              content: input.fileData,
              filename: input.fileName,
              type: input.mimeType,
              disposition: 'attachment',
            }],
          });
        } catch (e) {
          console.warn('[Copacker Invoice] Failed to email to AP:', e);
        }

        // 6. Create audit log
        await createAuditLog(ctx.user.id, 'create', 'copacker_invoice', invoiceResult.id, input.fileName);

        return {
          id: invoiceResult.id,
          parsedData,
          fileUrl,
          message: 'Invoice uploaded, parsed, and sent to accounts payable',
        };
      }),
  });
