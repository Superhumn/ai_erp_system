// appRouter.aiAgent — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { sendEmail, formatEmailHtml } from "../_core/email";
import { processEmailReply, analyzeEmail, generateEmailReply } from "../emailReplyService";
import * as db from "../db";
import { createProjectTaskFromSource } from "../taskAgentBridge";
import { adminProcedure, internalProcedure, createAuditLog, generateNumber } from "./_shared";

// ============================================
// AI AGENT SYSTEM
// ============================================
export const aiAgentRouter = router({
    // Tasks
    tasks: router({
      list: protectedProcedure
        .input(z.object({
          status: z.string().optional(),
          taskType: z.string().optional(),
          priority: z.string().optional(),
        }).optional())
        .query(({ input }) => db.getAiAgentTasks(input)),
      
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getAiAgentTaskById(input.id)),
      
      pendingApprovals: protectedProcedure.query(() => db.getPendingApprovalTasks()),
      
      create: internalProcedure
        .input(z.object({
          // NOTE: 'concierge_errand' is intentionally NOT creatable here. Errands
          // carry the submitting user's identity in taskData, which the executor
          // trusts to choose the execution context; allowing arbitrary clients to
          // POST that taskData would enable identity spoofing. Errands are created
          // server-side only, via the plan_errand agent tool.
          taskType: z.enum(['generate_po', 'send_rfq', 'send_quote_request', 'send_email', 'update_inventory', 'create_shipment', 'generate_invoice', 'reconcile_payment', 'reorder_materials', 'vendor_followup', 'create_work_order', 'query', 'reply_email', 'approve_po', 'approve_invoice', 'create_vendor', 'create_material', 'create_product', 'create_bom', 'create_customer', 'create_crm_deal']),
          priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
          taskData: z.string(), // JSON string with task-specific data
          aiReasoning: z.string().optional(),
          aiConfidence: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const task = await db.createAiAgentTask({
            taskType: input.taskType,
            priority: input.priority,
            status: 'pending_approval',
            taskData: input.taskData,
            aiReasoning: input.aiReasoning || 'Manual task creation',
            aiConfidence: input.aiConfidence || '100.00',
          });
          
          await db.createAiAgentLog({
            taskId: task.id,
            action: 'task_created',
            status: 'info',
            message: `Task created by ${ctx.user.name}`,
            details: input.taskData,
          });
          
          return task;
        }),
      
      bulkDelete: protectedProcedure
        .input(z.object({
          taskType: z.string().optional(),
          status: z.string().optional(),
        }).optional())
        .mutation(async ({ input, ctx }) => {
          const deleted = await db.bulkDeleteAiAgentTasks({
            taskType: input?.taskType,
            status: input?.status,
          });
          await createAuditLog(ctx.user.id, 'delete', 'ai_agent_task', 0, `Bulk delete tasks`);
          return { deleted };
        }),

      approve: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.updateAiAgentTask(input.id, {
            status: 'approved',
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          });
          await db.createAiAgentLog({
            taskId: input.id,
            action: 'task_approved',
            status: 'success',
            message: `Task approved by ${ctx.user.name}`,
          });

          // CRM deal approvals create the deal immediately on approval —
          // no separate execute step required.
          const task = await db.getAiAgentTaskById(input.id);
          if (task?.taskType === 'create_crm_deal') {
            try {
              const taskData = JSON.parse(task.taskData || '{}');
              const contact = taskData.contactId ? await db.getCrmContactById(taskData.contactId) : null;
              if (!contact) throw new Error('Contact not found for CRM deal');
              const company = (contact.organization || '').trim();
              if (!company) throw new Error(`Contact "${contact.fullName}" has no company set`);
              const existing = await db.findCrmDealByCompany(company);
              if (existing) throw new Error(`A deal already exists for "${company}" (deal #${existing.id})`);
              if (!taskData.pipelineId) throw new Error('Pipeline required to create CRM deal');

              const dealId = await db.createCrmDeal({
                pipelineId: taskData.pipelineId,
                contactId: taskData.contactId,
                name: company,
                stage: taskData.stage || 'discovery',
                amount: taskData.amount || undefined,
                source: taskData.source || undefined,
                notes: taskData.notes || undefined,
                assignedTo: taskData.assignedTo || undefined,
              });
              const result = { created: true, dealId, dealName: company };
              await db.updateAiAgentTask(input.id, {
                status: 'completed',
                executedAt: new Date(),
                executionResult: JSON.stringify(result),
              });
              await db.createAiAgentLog({
                taskId: input.id,
                action: 'task_executed',
                status: 'success',
                message: `CRM deal created for ${company}`,
                details: JSON.stringify(result),
              });
              return { success: true, autoExecuted: true, dealId, company };
            } catch (error: any) {
              await db.updateAiAgentTask(input.id, {
                status: 'failed',
                errorMessage: error.message,
              });
              await db.createAiAgentLog({
                taskId: input.id,
                action: 'task_execution_failed',
                status: 'error',
                message: `CRM deal creation failed: ${error.message}`,
              });
              throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
            }
          }

          return { success: true };
        }),
      
      reject: adminProcedure
        .input(z.object({ id: z.number(), reason: z.string().optional() }))
        .mutation(async ({ input, ctx }) => {
          await db.updateAiAgentTask(input.id, {
            status: 'rejected',
            rejectedBy: ctx.user.id,
            rejectedAt: new Date(),
            rejectionReason: input.reason,
          });
          await db.createAiAgentLog({
            taskId: input.id,
            action: 'task_rejected',
            status: 'warning',
            message: `Task rejected by ${ctx.user.name}: ${input.reason || 'No reason provided'}`,
          });
          return { success: true };
        }),

      // Inline approval for concierge errands: approve + run in a single step
      // straight from the AI chat, instead of parking the task in the Approval
      // Queue. Transitions directly to in_progress (skipping the 'approved'
      // state the background scheduler watches) so the errand can never be
      // double-executed.
      approveAndExecute: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const task = await db.getAiAgentTaskById(input.id);
          if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
          if (task.taskType !== 'concierge_errand') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Inline approval is only supported for concierge errands' });
          }
          if (task.status !== 'pending_approval') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: `Errand is not awaiting approval (status: ${task.status})` });
          }

          await db.updateAiAgentTask(input.id, {
            status: 'in_progress',
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          });
          await db.createAiAgentLog({
            taskId: input.id,
            action: 'task_approved',
            status: 'success',
            message: `Errand approved inline by ${ctx.user.name}`,
          });

          try {
            const { executeConciergeErrand } = await import('../conciergeErrandService');
            const r = await executeConciergeErrand(task);
            if (!r.success) throw new Error(r.error || 'Errand execution failed');
            await db.updateAiAgentTask(input.id, {
              status: 'completed',
              executedAt: new Date(),
              executionResult: JSON.stringify(r.data),
            });
            await db.createAiAgentLog({
              taskId: input.id,
              action: 'task_executed',
              status: 'success',
              message: 'Errand executed successfully (inline approval)',
              details: JSON.stringify(r.data),
            });
            return { success: true, result: r.data };
          } catch (error: any) {
            await db.updateAiAgentTask(input.id, {
              status: 'failed',
              errorMessage: error.message,
            });
            await db.createAiAgentLog({
              taskId: input.id,
              action: 'task_failed',
              status: 'error',
              message: `Errand execution failed: ${error.message}`,
            });
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
          }
        }),

      update: adminProcedure
        .input(z.object({ 
          id: z.number(), 
          taskData: z.string(),
          aiReasoning: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const task = await db.getAiAgentTaskById(input.id);
          if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
          
          // Validate JSON format
          let parsedTaskData: any;
          try {
            parsedTaskData = JSON.parse(input.taskData);
          } catch (e) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid JSON format in taskData'
            });
          }

          // Only allow updates on pending or approved tasks
          if (!['pending_approval', 'approved'].includes(task.status)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Can only update pending or approved tasks'
            });
          }

          let taskDataToSave = input.taskData;
          // Concierge errands execute under the original submitter's identity
          // (stored in taskData). Those fields are immutable — preserve them from
          // the original task so editing the plan can never change WHO it runs as,
          // preventing identity spoofing via this admin endpoint.
          if (task.taskType === 'concierge_errand') {
            // Parse defensively so a malformed stored row or a valid-but-non-object
            // payload (null/array) can't turn a recoverable bad edit into a 500.
            const isPlainObject = (v: any) => v != null && typeof v === 'object' && !Array.isArray(v);
            if (!isPlainObject(parsedTaskData)) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'Errand taskData must be a JSON object' });
            }
            let original: any = {};
            try { original = JSON.parse(task.taskData || '{}'); } catch { original = {}; }
            if (!isPlainObject(original)) original = {};
            parsedTaskData.submittedByUserId = original.submittedByUserId;
            parsedTaskData.userName = original.userName;
            parsedTaskData.userRole = original.userRole;
            // Keep taskData.companyId in sync with the authoritative row column
            // (not the old JSON) so an edit can't persist a tenancy mismatch.
            parsedTaskData.companyId = task.companyId ?? undefined;
            taskDataToSave = JSON.stringify(parsedTaskData);
          }

          await db.updateAiAgentTask(input.id, {
            taskData: taskDataToSave,
            aiReasoning: input.aiReasoning || task.aiReasoning || undefined,
          });
          
          await db.createAiAgentLog({
            taskId: input.id,
            action: 'task_updated',
            status: 'info',
            message: `Task data updated by ${ctx.user.name}`,
            details: input.taskData,
          });
          
          return { success: true };
        }),
      
      execute: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const task = await db.getAiAgentTaskById(input.id);
          if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
          if (task.status !== 'approved') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Task must be approved before execution' });
          }
          
          await db.updateAiAgentTask(input.id, { status: 'in_progress' });
          
          try {
            // Execute based on task type
            const taskData = JSON.parse(task.taskData);
            let result: any = {};
            
            switch (task.taskType) {
              case 'generate_po': {
                // Create PO with line items for raw materials
                const poNumber = generateNumber('PO');
                
                // Resolve material by ID or name
                let material = null;
                if (taskData.rawMaterialId) {
                  material = await db.getRawMaterialById(taskData.rawMaterialId);
                } else if (taskData.rawMaterialName) {
                  const allMaterials = await db.getRawMaterials();
                  material = allMaterials.find(m =>
                    m.name?.toLowerCase().includes(taskData.rawMaterialName.toLowerCase()) ||
                    m.sku?.toLowerCase() === taskData.rawMaterialName.toLowerCase()
                  ) || null;
                }
                
                // Resolve vendor - use provided ID, material's preferred vendor, or create draft without vendor
                let vendor = null;
                let vendorId = taskData.vendorId;
                
                if (vendorId) {
                  vendor = await db.getVendorById(vendorId);
                } else if (material?.preferredVendorId) {
                  vendor = await db.getVendorById(material.preferredVendorId);
                  vendorId = material.preferredVendorId;
                }
                
                // If no vendor found, return needs_vendor status
                if (!vendorId) {
                  await db.updateAiAgentTask(task.id, {
                    status: 'needs_vendor',
                    executedAt: new Date(),
                  });
                  await db.createAiAgentLog({
                    taskId: task.id,
                    action: 'execution_needs_input',
                    status: 'warning',
                    message: `PO generation requires vendor selection for ${material?.name || taskData.rawMaterialName || 'material'}`,
                    details: JSON.stringify({ materialId: material?.id, materialName: material?.name || taskData.rawMaterialName }),
                  });
                  return { success: false, status: 'needs_vendor', message: 'Please select a vendor for this PO' };
                }
                
                // Calculate expected date based on vendor lead time
                const leadDays = vendor?.defaultLeadTimeDays || material?.leadTimeDays || 14;
                const expectedDate = new Date();
                expectedDate.setDate(expectedDate.getDate() + leadDays);
                
                const unitCost = parseFloat(taskData.unitCost || material?.unitCost || '0');
                const quantity = parseFloat(taskData.quantity || '0');
                const subtotal = unitCost * quantity;
                const totalAmount = subtotal; // Could add tax/shipping later
                
                const po = await db.createPurchaseOrder({
                  poNumber,
                  vendorId: vendorId,
                  orderDate: new Date(),
                  expectedDate,
                  notes: taskData.notes || `AI-generated PO for ${material?.name || 'materials'}`,
                  subtotal: subtotal.toFixed(2),
                  totalAmount: totalAmount.toFixed(2),
                  status: 'draft',
                });
                
                // Create PO line item for the raw material
                if (material) {
                  await db.createPurchaseOrderItem({
                    purchaseOrderId: po.id,
                    description: material.name,
                    quantity: quantity.toString(),
                    unitPrice: unitCost.toFixed(2),
                    totalAmount: subtotal.toFixed(2),
                  });
                  
                  // Update raw material with on-order quantity
                  await db.updateRawMaterial(material.id, {
                    quantityOnOrder: ((parseFloat(material.quantityOnOrder?.toString() || '0')) + quantity).toString(),
                    receivingStatus: 'ordered',
                    expectedDeliveryDate: expectedDate,
                    lastPoId: po.id,
                  });
                }
                
                result = { purchaseOrderId: po.id, poNumber, expectedDate: expectedDate.toISOString(), totalAmount: totalAmount.toFixed(2) };
                break;
              }
              
              case 'send_rfq': {
                // Create RFQ and send emails to vendors
                const material = taskData.rawMaterialId ? await db.getRawMaterialById(taskData.rawMaterialId) : null;
                const vendorIds = taskData.vendorIds || [];
                const emailsSent: string[] = [];

                // Batch load all vendors instead of N+1
                const vendorsForRfq = vendorIds.length > 0
                  ? await db.getVendorsByIds(vendorIds)
                  : [];

                // Send emails in parallel
                const emailPromises = vendorsForRfq
                  .filter(vendor => vendor.email)
                  .map(vendor => sendEmail({
                    to: vendor.email!,
                    subject: `Request for Quote: ${material?.name || 'Materials'}`,
                    html: `
                      <p>Dear ${vendor.contactName || vendor.name},</p>
                      <p>We are requesting a quote for the following:</p>
                      <ul>
                        <li><strong>Material:</strong> ${material?.name || 'Various materials'}</li>
                        <li><strong>SKU:</strong> ${material?.sku || 'N/A'}</li>
                        <li><strong>Quantity:</strong> ${taskData.quantity} ${material?.unit || 'units'}</li>
                        <li><strong>Required By:</strong> ${taskData.requiredDate || 'ASAP'}</li>
                      </ul>
                      <p>Please reply with your best price and lead time.</p>
                      <p>Best regards,<br/>Procurement Team</p>
                    `,
                  }).then(r => r.success ? vendor.email! : null));

                const results = await Promise.all(emailPromises);
                emailsSent.push(...results.filter((e): e is string => e !== null));

                result = { rfqSent: true, vendorCount: vendorIds.length, emailsSent };
                break;
              }
              
              case 'send_email': {
                // Send general email
                const emailResult = await sendEmail({
                  to: taskData.to,
                  subject: taskData.subject,
                  html: taskData.body || taskData.content,
                });
                result = { emailSent: emailResult.success, messageId: emailResult.messageId };
                break;
              }
              
              case 'vendor_followup': {
                // Send follow-up email to vendor
                const vendor = await db.getVendorById(taskData.vendorId);
                if (vendor && vendor.email) {
                  const emailResult = await sendEmail({
                    to: vendor.email,
                    subject: taskData.subject || `Follow-up: ${taskData.poNumber || 'Order Status'}`,
                    html: taskData.body || `
                      <p>Dear ${vendor.contactName || vendor.name},</p>
                      <p>We are following up on ${taskData.poNumber ? `PO ${taskData.poNumber}` : 'our recent order'}.</p>
                      <p>Could you please provide an update on the status and expected delivery date?</p>
                      <p>Best regards,<br/>Procurement Team</p>
                    `,
                  });
                  result = { emailSent: emailResult.success, vendorEmail: vendor.email };
                } else {
                  result = { emailSent: false, error: 'Vendor email not found' };
                }
                break;
              }
              
              case 'reorder_materials': {
                // Create work order from BOM (reorder_materials type handles work orders)
                const bom = taskData.bomId ? await db.getBomById(taskData.bomId) : null;
                if (!bom) throw new Error('BOM not found');
                
                const workOrder = await db.createWorkOrder({
                  bomId: bom.id,
                  productId: bom.productId,
                  quantity: taskData.quantity?.toString() || '1',
                  status: 'draft',
                  priority: taskData.priority || 'medium',
                  notes: taskData.notes || `AI-generated work order for ${bom.name}`,
                });
                
                // Create work order materials from BOM components
                const components = await db.getBomComponents(bom.id);
                for (const comp of components) {
                  const requiredQty = parseFloat(comp.quantity?.toString() || '0') * parseFloat(taskData.quantity || '1');
                  await db.createWorkOrderMaterial({
                    workOrderId: workOrder.id,
                    rawMaterialId: comp.rawMaterialId || undefined,
                    productId: comp.productId || undefined,
                    name: comp.name,
                    requiredQuantity: requiredQty.toString(),
                    unit: comp.unit || 'EA',
                    status: 'pending',
                  });
                }
                
                result = { workOrderId: workOrder.id, workOrderNumber: workOrder.workOrderNumber, materialsCount: components.length };
                break;
              }
              
              case 'update_inventory': {
                // Update inventory levels
                if (taskData.rawMaterialId) {
                  await db.upsertRawMaterialInventory(taskData.rawMaterialId, taskData.warehouseId || 1, {
                    quantity: taskData.quantity?.toString(),
                  });
                }
                result = { updated: true };
                break;
              }
              
              case 'reply_email': {
                // AI-generated email reply with LLM
                if (taskData.generateWithAI !== false) {
                  // Use AI to generate the reply
                  const emailReplyResult = await processEmailReply({
                    originalEmail: {
                      from: taskData.to, // The recipient is who we're replying to
                      subject: taskData.originalSubject || 'Your inquiry',
                      body: taskData.originalBody || '',
                      emailId: taskData.emailId,
                    },
                    autoSend: true,
                    companyName: taskData.companyName || 'Our Company',
                    senderName: taskData.senderName || ctx.user.name,
                    senderTitle: taskData.senderTitle,
                  });
                  result = {
                    emailSent: emailReplyResult.emailSent,
                    messageId: emailReplyResult.messageId,
                    to: taskData.to,
                    generatedReply: emailReplyResult.generatedReply,
                    aiGenerated: true,
                  };
                } else {
                  // Send pre-written reply
                  const replyResult = await sendEmail({
                    to: taskData.to,
                    subject: taskData.subject || `Re: ${taskData.originalSubject || 'Your inquiry'}`,
                    html: formatEmailHtml(taskData.body || taskData.content || ''),
                  });
                  result = { emailSent: replyResult.success, messageId: replyResult.messageId, to: taskData.to, aiGenerated: false };
                }
                break;
              }
              
              case 'approve_po': {
                // Auto-approve PO
                const po = await db.getPurchaseOrderById(taskData.purchaseOrderId);
                if (!po) throw new Error('Purchase order not found');
                await db.updatePurchaseOrder(taskData.purchaseOrderId, {
                  status: 'confirmed',
                });
                result = { approved: true, poId: taskData.purchaseOrderId, poNumber: po.poNumber };
                break;
              }
              
              case 'approve_invoice': {
                // Auto-approve invoice
                const invoice = await db.getInvoiceById(taskData.invoiceId);
                if (!invoice) throw new Error('Invoice not found');
                await db.updateInvoice(taskData.invoiceId, {
                  status: 'sent',
                });
                result = { approved: true, invoiceId: taskData.invoiceId, invoiceNumber: invoice.invoiceNumber };
                break;
              }
              
              case 'create_vendor': {
                // Create new vendor
                const vendor = await db.createVendor({
                  name: taskData.name,
                  email: taskData.email || undefined,
                  phone: taskData.phone || undefined,
                  address: taskData.address || undefined,
                  defaultLeadTimeDays: taskData.leadTimeDays || undefined,
                  status: 'active',
                });
                result = { created: true, vendorId: vendor.id, vendorName: taskData.name };
                break;
              }
              
              case 'create_material': {
                // Create new raw material
                const material = await db.createRawMaterial({
                  name: taskData.name,
                  sku: taskData.sku || undefined,
                  unit: taskData.unit || 'units',
                  category: taskData.category || undefined,
                  unitCost: taskData.unitCost || undefined,
                  description: taskData.description || undefined,
                });
                result = { created: true, materialId: material.id, materialName: taskData.name };
                break;
              }
              
              case 'create_product': {
                // Create new product
                const product = await db.createProduct({
                  name: taskData.name,
                  sku: taskData.sku || undefined,
                  category: taskData.category || undefined,
                  unitPrice: taskData.price || taskData.unitPrice || undefined,
                  description: taskData.description || undefined,
                });
                result = { created: true, productId: product.id, productName: taskData.name };
                break;
              }
              
              case 'create_bom': {
                // Create new BOM
                const bom = await db.createBom({
                  productId: taskData.productId,
                  name: taskData.name,
                  batchSize: taskData.batchSize || undefined,
                  batchUnit: taskData.batchUnit || undefined,
                  notes: taskData.notes || undefined,
                });
                result = { created: true, bomId: bom.id, bomName: taskData.name };
                break;
              }
              
              case 'create_customer': {
                // Create new customer
                const customer = await db.createCustomer({
                  name: taskData.name,
                  email: taskData.email || undefined,
                  phone: taskData.phone || undefined,
                  address: taskData.address || undefined,
                  type: taskData.type || 'business',
                });
                result = { created: true, customerId: customer.id, customerName: taskData.name };
                break;
              }

              case 'create_crm_deal': {
                // Resolve company name from contact's organization (the deal's title).
                const contact = taskData.contactId ? await db.getCrmContactById(taskData.contactId) : null;
                if (!contact) throw new Error('Contact not found for CRM deal');
                const company = (contact.organization || '').trim();
                if (!company) {
                  throw new Error(`Cannot create deal: contact "${contact.fullName}" has no company set`);
                }

                // Re-check duplicates at execution time in case another deal was approved
                // for the same company while this one was waiting.
                const existing = await db.findCrmDealByCompany(company);
                if (existing) {
                  throw new Error(`A deal already exists for company "${company}" (deal #${existing.id})`);
                }

                if (!taskData.pipelineId) throw new Error('Pipeline required to create CRM deal');

                const dealId = await db.createCrmDeal({
                  pipelineId: taskData.pipelineId,
                  contactId: taskData.contactId,
                  name: company,
                  stage: taskData.stage || 'discovery',
                  amount: taskData.amount || undefined,
                  source: taskData.source || undefined,
                  notes: taskData.notes || undefined,
                  assignedTo: taskData.assignedTo || undefined,
                });
                result = { created: true, dealId, dealName: company };
                break;
              }

              case 'create_work_order': {
                // Create work order from BOM
                const bom = taskData.bomId ? await db.getBomById(taskData.bomId) : null;
                if (!bom) throw new Error('BOM not found');
                
                const workOrder = await db.createWorkOrder({
                  bomId: bom.id,
                  productId: bom.productId,
                  quantity: taskData.quantity?.toString() || '1',
                  status: 'draft',
                  priority: taskData.priority || 'medium',
                  notes: taskData.notes || `AI-generated work order for ${bom.name}`,
                });
                
                result = { created: true, workOrderId: workOrder.id, workOrderNumber: workOrder.workOrderNumber };
                break;
              }

              case 'concierge_errand': {
                // Replay the approved plan through the main AI agent loop.
                const { executeConciergeErrand } = await import('../conciergeErrandService');
                const errandResult = await executeConciergeErrand(task);
                if (!errandResult.success) throw new Error(errandResult.error || 'Errand execution failed');
                result = errandResult.data;
                break;
              }

              case 'query': {
                // Generic "query" tasks can carry a structured action. The
                // meeting extractor uses action=create_project_task to route a
                // Fireflies action item through the Approval Queue; executing
                // the approved suggestion creates the real project task here,
                // preserving the meeting source so it keeps its "Meeting" badge.
                if (taskData.action === 'create_project_task') {
                  // taskData is untrusted JSON — validate every field before use.
                  const toPositiveInt = (v: unknown): number | undefined => {
                    const n = Number(v);
                    return Number.isInteger(n) && n > 0 ? n : undefined;
                  };
                  const projectId = toPositiveInt(taskData.projectId);
                  const name = taskData.name ? String(taskData.name).trim() : '';
                  if (!projectId || !name) {
                    throw new Error('Project task suggestion missing or invalid projectId or name');
                  }
                  const assigneeId = toPositiveInt(taskData.assigneeId);
                  // Keep the source ref pair consistent: both derive from meetingId
                  // (an undefined id must not leave a dangling refType).
                  const meetingRefId = toPositiveInt(taskData.sourceMeeting?.meetingId);
                  // Validate priority against the allowed set and only accept a
                  // genuinely parseable dueDate so a malformed value can't insert
                  // an Invalid Date.
                  const priority = (['low', 'medium', 'high', 'critical'] as const).includes(taskData.priority)
                    ? taskData.priority
                    : 'medium';
                  let dueDate: Date | undefined;
                  if (taskData.dueDate) {
                    const parsed = new Date(taskData.dueDate);
                    if (!Number.isNaN(parsed.getTime())) dueDate = parsed;
                  }
                  // Carry the suggestion's AI reasoning/confidence onto the
                  // created task so it stays as traceable as a directly
                  // extracted meeting task.
                  const aiConfidenceNum = task.aiConfidence != null && Number.isFinite(Number(task.aiConfidence))
                    ? Number(task.aiConfidence)
                    : undefined;
                  const created = await createProjectTaskFromSource({
                    projectId,
                    name,
                    description: taskData.description ? String(taskData.description) : undefined,
                    assigneeId,
                    priority,
                    dueDate,
                    sourceType: 'meeting',
                    sourceRefType: meetingRefId ? 'firefliesMeeting' : undefined,
                    sourceRefId: meetingRefId,
                    sourceExternalId: taskData.sourceExternalId ? String(taskData.sourceExternalId) : undefined,
                    aiReasoning: task.aiReasoning ?? undefined,
                    aiConfidence: aiConfidenceNum,
                    createdBy: ctx.user.id,
                  });
                  result = {
                    created: true,
                    action: 'create_project_task',
                    projectTaskId: created.id,
                    projectId,
                    assigneeId: assigneeId ?? null,
                  };
                  break;
                }
                result = { executed: true, taskType: task.taskType };
                break;
              }

              default:
                result = { executed: true, taskType: task.taskType };
            }
            
            await db.updateAiAgentTask(input.id, {
              status: 'completed',
              executedAt: new Date(),
              executionResult: JSON.stringify(result),
            });
            
            await db.createAiAgentLog({
              taskId: input.id,
              action: 'task_executed',
              status: 'success',
              message: `Task executed successfully`,
              details: JSON.stringify(result),
            });
            
            return { success: true, result };
          } catch (error: any) {
            await db.updateAiAgentTask(input.id, {
              status: 'failed',
              errorMessage: error.message,
              retryCount: (task.retryCount || 0) + 1,
            });
            
            await db.createAiAgentLog({
              taskId: input.id,
              action: 'task_failed',
              status: 'error',
              message: `Task execution failed: ${error.message}`,
            });
            
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
          }
        }),
    }),
    
    // Rules
    rules: router({
      list: protectedProcedure
        .input(z.object({ ruleType: z.string().optional(), isActive: z.boolean().optional() }).optional())
        .query(({ input }) => db.getAiAgentRules(input)),
      
      create: adminProcedure
        .input(z.object({
          name: z.string(),
          description: z.string().optional(),
          ruleType: z.enum(['inventory_reorder', 'po_auto_generate', 'rfq_auto_send', 'vendor_followup', 'payment_reminder', 'shipment_tracking', 'price_alert', 'quality_check']),
          triggerCondition: z.string(),
          actionConfig: z.string(),
          requiresApproval: z.boolean().default(true),
          autoApproveThreshold: z.string().optional(),
          notifyUsers: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          return db.createAiAgentRule({ ...input, createdBy: ctx.user.id });
        }),
      
      update: adminProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          triggerCondition: z.string().optional(),
          actionConfig: z.string().optional(),
          requiresApproval: z.boolean().optional(),
          autoApproveThreshold: z.string().optional(),
          notifyUsers: z.string().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateAiAgentRule(id, data);
          return { success: true };
        }),
    }),
    
    // Logs
    logs: router({
      list: protectedProcedure
        .input(z.object({
          taskId: z.number().optional(),
          ruleId: z.number().optional(),
          status: z.string().optional(),
          limit: z.number().default(100),
        }).optional())
        .query(({ input }) => db.getAiAgentLogs(input, input?.limit)),
    }),
    
    // Email Templates
    emailTemplates: router({
      list: protectedProcedure
        .input(z.object({ templateType: z.string().optional(), isActive: z.boolean().optional() }).optional())
        .query(({ input }) => db.getEmailTemplates(input)),
      
      create: adminProcedure
        .input(z.object({
          name: z.string(),
          templateType: z.enum(['po_to_vendor', 'rfq_request', 'quote_request', 'shipment_confirmation', 'payment_reminder', 'vendor_followup', 'quality_issue', 'general']),
          subject: z.string(),
          bodyTemplate: z.string(),
          isDefault: z.boolean().default(false),
        }))
        .mutation(async ({ input, ctx }) => {
          return db.createEmailTemplate({ ...input, createdBy: ctx.user.id });
        }),
      
      update: adminProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          subject: z.string().optional(),
          bodyTemplate: z.string().optional(),
          isDefault: z.boolean().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateEmailTemplate(id, data);
          return { success: true };
        }),
    }),
    
    // AI-driven automation triggers
    generatePoSuggestion: adminProcedure
      .input(z.object({
        rawMaterialId: z.number(),
        quantity: z.string(),
        vendorId: z.number().optional(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Get material and vendor info
        const material = await db.getRawMaterialById(input.rawMaterialId);
        if (!material) throw new TRPCError({ code: 'NOT_FOUND', message: 'Material not found' });
        
        const vendorId = input.vendorId || material.preferredVendorId;
        if (!vendorId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No vendor specified' });
        
        const vendor = await db.getVendorById(vendorId);
        if (!vendor) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vendor not found' });
        
        // Calculate expected date based on lead time
        const leadDays = vendor.defaultLeadTimeDays || 14;
        const expectedDate = new Date();
        expectedDate.setDate(expectedDate.getDate() + leadDays);
        
        // Calculate total amount
        const unitCost = parseFloat(material.unitCost?.toString() || '0');
        const qty = parseFloat(input.quantity);
        const totalAmount = (unitCost * qty).toFixed(2);
        
        // Create AI task for PO generation
        const task = await db.createAiAgentTask({
          taskType: 'generate_po',
          priority: 'medium',
          taskData: JSON.stringify({
            vendorId,
            vendorName: vendor.name,
            rawMaterialId: input.rawMaterialId,
            materialName: material.name,
            quantity: input.quantity,
            unitCost: material.unitCost,
            totalAmount,
            expectedDate: expectedDate.toISOString(),
            notes: input.reason || `Auto-generated PO for ${material.name}`,
          }),
          aiReasoning: input.reason || `Material ${material.name} needs reorder. Current stock is low.`,
          aiConfidence: '85.00',
          relatedEntityType: 'rawMaterial',
          relatedEntityId: input.rawMaterialId,
          requiresApproval: true,
        });
        
        await db.createAiAgentLog({
          taskId: task.id,
          action: 'po_suggestion_created',
          status: 'info',
          message: `PO suggestion created for ${material.name} from ${vendor.name}`,
          details: JSON.stringify({ quantity: input.quantity, totalAmount }),
        });
        
        return task;
      }),
    
    generateRfqSuggestion: adminProcedure
      .input(z.object({
        rawMaterialId: z.number(),
        quantity: z.string(),
        vendorIds: z.array(z.number()),
        dueDate: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const material = await db.getRawMaterialById(input.rawMaterialId);
        if (!material) throw new TRPCError({ code: 'NOT_FOUND', message: 'Material not found' });
        
        const task = await db.createAiAgentTask({
          taskType: 'send_rfq',
          priority: 'medium',
          taskData: JSON.stringify({
            rawMaterialId: input.rawMaterialId,
            materialName: material.name,
            quantity: input.quantity,
            vendorIds: input.vendorIds,
            dueDate: input.dueDate?.toISOString(),
          }),
          aiReasoning: `RFQ needed for ${material.name} to compare vendor pricing`,
          aiConfidence: '90.00',
          relatedEntityType: 'rawMaterial',
          relatedEntityId: input.rawMaterialId,
          requiresApproval: true,
        });
        
        return task;
      }),
    
    // AI Email Reply Generation
    analyzeEmail: protectedProcedure
      .input(z.object({
        from: z.string(),
        subject: z.string(),
        body: z.string(),
      }))
      .mutation(async ({ input }) => {
        return analyzeEmail(input);
      }),
    
    generateEmailReply: protectedProcedure
      .input(z.object({
        originalEmail: z.object({
          from: z.string(),
          subject: z.string(),
          body: z.string(),
          emailId: z.number().optional(),
        }),
        companyName: z.string().optional(),
        senderName: z.string().optional(),
        senderTitle: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return generateEmailReply({
          originalEmail: input.originalEmail,
          companyContext: {
            companyName: input.companyName || 'Our Company',
            senderName: input.senderName || ctx.user.name || 'Customer Service',
            senderTitle: input.senderTitle,
          },
        });
      }),
    
    sendEmailReply: protectedProcedure
      .input(z.object({
        originalEmail: z.object({
          from: z.string(),
          subject: z.string(),
          body: z.string(),
          emailId: z.number().optional(),
        }),
        autoSend: z.boolean().default(false),
        companyName: z.string().optional(),
        senderName: z.string().optional(),
        senderTitle: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return processEmailReply({
          originalEmail: input.originalEmail,
          autoSend: input.autoSend,
          companyName: input.companyName,
          senderName: input.senderName || ctx.user.name || 'Customer Service',
          senderTitle: input.senderTitle,
        });
      }),
    
    // Create email reply task for approval queue
    createEmailReplyTask: protectedProcedure
      .input(z.object({
        to: z.string(),
        originalSubject: z.string(),
        originalBody: z.string(),
        emailId: z.number().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
        companyName: z.string().optional(),
        senderName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // First generate a preview of the reply
        const preview = await generateEmailReply({
          originalEmail: {
            from: input.to,
            subject: input.originalSubject,
            body: input.originalBody,
          },
          companyContext: {
            companyName: input.companyName || 'Our Company',
            senderName: input.senderName || ctx.user.name || 'Customer Service',
          },
        });
        
        // Create task with the generated reply for approval
        const task = await db.createAiAgentTask({
          taskType: 'reply_email',
          priority: input.priority,
          taskData: JSON.stringify({
            to: input.to,
            originalSubject: input.originalSubject,
            originalBody: input.originalBody,
            emailId: input.emailId,
            generatedSubject: preview.subject,
            generatedBody: preview.body,
            tone: preview.tone,
            suggestedActions: preview.suggestedActions,
            companyName: input.companyName,
            senderName: input.senderName || ctx.user.name || 'Customer Service',
            generateWithAI: true,
          }),
          aiReasoning: `AI-generated reply to email from ${input.to}. Tone: ${preview.tone}. Confidence: ${preview.confidence}%`,
          aiConfidence: preview.confidence.toFixed(2),
          relatedEntityType: 'email',
          relatedEntityId: input.emailId || 0,
          requiresApproval: true,
        });
        
        await db.createAiAgentLog({
          taskId: task.id,
          action: 'email_reply_generated',
          status: 'info',
          message: `Email reply generated for ${input.to}`,
          details: JSON.stringify({ subject: preview.subject, tone: preview.tone }),
        });
        
        return { task, preview };
      }),
  });
