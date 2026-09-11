// appRouter.customs — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { opsProcedure, createAuditLog } from "./_shared";

// ============================================
// CUSTOMS CLEARANCE
// ============================================
export const customsRouter = router({
    clearances: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional(), type: z.enum(['import', 'export']).optional() }).optional())
        .query(({ input }) => db.getCustomsClearances(input)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getCustomsClearanceById(input.id)),
      create: opsProcedure
        .input(z.object({
          shipmentId: z.number().optional(),
          rfqId: z.number().optional(),
          type: z.enum(['import', 'export']),
          customsOffice: z.string().optional(),
          portOfEntry: z.string().optional(),
          country: z.string().optional(),
          customsBrokerId: z.number().optional(),
          brokerReference: z.string().optional(),
          expectedClearanceDate: z.date().optional(),
          hsCode: z.string().optional(),
          countryOfOrigin: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createCustomsClearance(input);
          await createAuditLog(ctx.user.id, 'create', 'customs_clearance', result.id, result.clearanceNumber);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending_documents', 'documents_submitted', 'under_review', 'additional_info_required', 'cleared', 'held', 'rejected']).optional(),
          submissionDate: z.date().optional(),
          expectedClearanceDate: z.date().optional(),
          actualClearanceDate: z.date().optional(),
          dutyAmount: z.string().optional(),
          taxAmount: z.string().optional(),
          otherFees: z.string().optional(),
          totalAmount: z.string().optional(),
          warehouseId: z.number().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, warehouseId, ...data } = input;

          // When clearing customs (status -> "cleared"), update inventory for inbound shipments
          if (data.status === 'cleared') {
            if (!warehouseId) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'warehouseId is required when clearing customs with inventory update' });
            }
            const clearance = await db.getCustomsClearanceById(id);
            // Only run inventory receipt if transitioning TO 'cleared' from a non-cleared status
            if (clearance?.status !== 'cleared' && clearance?.shipmentId) {
              if (!warehouseId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'warehouseId is required when clearing customs with inventory update' });
              }
              const shipment = await db.getShipmentById(clearance.shipmentId);
              if (shipment?.purchaseOrderId) {
                const poItems = await db.getPurchaseOrderItems(shipment.purchaseOrderId);
                for (const item of poItems) {
                  const quantity = item.quantity || '0';
                  const existingInventory = await db.getInventory({ productId: item.productId ?? undefined, warehouseId });
                  if (existingInventory.length > 0) {
                    const existing = existingInventory[0];
                    const newQty = (parseFloat(existing.quantity) + parseFloat(quantity)).toString();
                    await db.updateInventory(existing.id, { quantity: newQty });
                  } else {
                    await db.createInventory({
                      productId: item.productId,
                      warehouseId,
                      quantity,
                      companyId: shipment.companyId,
                    } as any);
                  }
                  await db.createInventoryTransaction({
                    transactionType: 'receive' as any,
                    productId: item.productId,
                    toWarehouseId: warehouseId,
                    quantity,
                    referenceType: 'purchase_order',
                    referenceId: shipment.purchaseOrderId,
                    performedBy: ctx.user.id,
                  } as any);
                  await db.updatePurchaseOrderItem(item.id, { receivedQuantity: item.quantity });
                }
                await db.updateShipment(clearance.shipmentId, { status: 'delivered' });
              }
            }
          }

          await db.updateCustomsClearance(id, data);

          await createAuditLog(ctx.user.id, 'update', 'customs_clearance', id);
          return { success: true };
        }),
      
      // AI summary of clearance status
      getSummary: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const clearance = await db.getCustomsClearanceById(input.id);
          if (!clearance) return null;
          
          const documents = await db.getCustomsDocuments(input.id);
          
          const summaryPrompt = `Summarize the customs clearance status:

Clearance Number: ${clearance.clearanceNumber}
Type: ${clearance.type}
Status: ${clearance.status}
Port: ${clearance.portOfEntry || 'N/A'}
Country: ${clearance.country || 'N/A'}
HS Code: ${clearance.hsCode || 'N/A'}
Country of Origin: ${clearance.countryOfOrigin || 'N/A'}

Documents (${documents.length} total):
${documents.map(d => `- ${d.documentType}: ${d.status}`).join('\n')}

Duties/Taxes:
- Duty: ${clearance.dutyAmount || 'TBD'}
- Tax: ${clearance.taxAmount || 'TBD'}
- Other: ${clearance.otherFees || 'TBD'}
- Total: ${clearance.totalAmount || 'TBD'}

Provide a brief status summary, any missing documents, and next steps.`;

          const response = await invokeLLM({
            messages: [
              { role: 'system', content: 'You are a customs clearance specialist. Provide clear, actionable status summaries.' },
              { role: 'user', content: summaryPrompt },
            ],
          });
          
          const rawSummary = response.choices[0]?.message?.content;
          return {
            clearance,
            documents,
            aiSummary: typeof rawSummary === 'string' ? rawSummary : 'Unable to generate summary.',
          };
        }),
    }),
    
    documents: router({
      list: protectedProcedure
        .input(z.object({ clearanceId: z.number() }))
        .query(({ input }) => db.getCustomsDocuments(input.clearanceId)),
      create: opsProcedure
        .input(z.object({
          clearanceId: z.number(),
          documentType: z.enum([
            'commercial_invoice', 'packing_list', 'bill_of_lading', 'airway_bill',
            'certificate_of_origin', 'customs_declaration', 'import_license', 'export_license',
            'insurance_certificate', 'inspection_certificate', 'phytosanitary_certificate',
            'fumigation_certificate', 'dangerous_goods_declaration', 'other'
          ]),
          name: z.string(),
          fileUrl: z.string().optional(),
          fileKey: z.string().optional(),
          mimeType: z.string().optional(),
          fileSize: z.number().optional(),
          expiryDate: z.date().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createCustomsDocument({ ...input, status: input.fileUrl ? 'uploaded' : 'pending' });
          await createAuditLog(ctx.user.id, 'create', 'customs_document', result.id, input.name);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(['pending', 'uploaded', 'verified', 'rejected', 'expired']).optional(),
          fileUrl: z.string().optional(),
          fileKey: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          if (data.status === 'verified') {
            (data as any).verifiedAt = new Date();
            (data as any).verifiedById = ctx.user.id;
          }
          await db.updateCustomsDocument(id, data);
          await createAuditLog(ctx.user.id, 'update', 'customs_document', id);
          return { success: true };
        }),
      
      // Upload document file
      upload: opsProcedure
        .input(z.object({
          clearanceId: z.number(),
          documentType: z.enum([
            'commercial_invoice', 'packing_list', 'bill_of_lading', 'airway_bill',
            'certificate_of_origin', 'customs_declaration', 'import_license', 'export_license',
            'insurance_certificate', 'inspection_certificate', 'phytosanitary_certificate',
            'fumigation_certificate', 'dangerous_goods_declaration', 'other'
          ]),
          name: z.string(),
          fileData: z.string(), // Base64 encoded
          mimeType: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          const buffer = Buffer.from(input.fileData, 'base64');
          const fileKey = `customs/${input.clearanceId}/${nanoid()}-${input.name}`;
          
          const { url } = await storagePut(fileKey, buffer, input.mimeType);
          
          const result = await db.createCustomsDocument({
            clearanceId: input.clearanceId,
            documentType: input.documentType,
            name: input.name,
            fileUrl: url,
            fileKey,
            mimeType: input.mimeType,
            fileSize: buffer.length,
            status: 'uploaded',
          });
          
          await createAuditLog(ctx.user.id, 'create', 'customs_document', result.id, input.name);
          
          return { id: result.id, url };
        }),
     }),
  });
