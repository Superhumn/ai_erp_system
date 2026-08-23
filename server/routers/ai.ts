import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { sendEmail, formatEmailHtml } from "../_core/email";
import { processEmailReply, analyzeEmail, generateEmailReply } from "../emailReplyService";
import { processAIAgentRequest, getQuickAnalysis, getSystemOverview, getPendingActions, type AIAgentContext } from "../aiAgentService";
import { syncAgentStatusToProjectTask } from "../taskAgentBridge";
import * as db from "../db";
import { router, protectedProcedure, adminProcedure, generateNumber } from "./middleware";

export const aiRouter = router({
  // ============================================
  // AI ASSISTANT
  // ============================================
  ai: router({
    conversations: protectedProcedure.query(({ ctx }) => db.getAiConversations(ctx.user.id)),
    getConversation: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const conversation = await db.getAiConversationById(input.id);
        if (!conversation) return null;
        const messages = await db.getAiMessages(input.id);
        return { ...conversation, messages };
      }),
    createConversation: protectedProcedure
      .input(z.object({ title: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createAiConversation({ userId: ctx.user.id, title: input.title || 'New Conversation' });
        return result;
      }),
    chat: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        message: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        // Save user message
        await db.createAiMessage({
          conversationId: input.conversationId,
          role: 'user',
          content: input.message,
        });

        // Get dashboard metrics for context
        const metrics = await db.getDashboardMetrics();
        
        // Build system prompt with ERP context
        const systemPrompt = `You are an AI assistant for an ERP system. You have access to the following real-time business metrics:

Current Business Metrics:
- Active Customers: ${metrics?.customers || 0}
- Active Vendors: ${metrics?.vendors || 0}
- Products: ${metrics?.products || 0}
- Active Employees: ${metrics?.activeEmployees || 0}
- Active Projects: ${metrics?.activeProjects || 0}
- Active Contracts: ${metrics?.activeContracts || 0}
- Revenue This Month: $${metrics?.revenueThisMonth || 0}
- Invoices Paid: $${metrics?.invoicesPaid || 0}
- Pending Invoices: ${metrics?.pendingInvoices || 0}
- Pending Purchase Orders: ${metrics?.pendingPurchaseOrders || 0}
- Open Disputes: ${metrics?.openDisputes || 0}

You have FULL access to create, read, update, and delete all data in the ERP system. You can help users with:
1. Answering questions about business metrics and KPIs
2. Providing insights on financial health, cash flow, and revenue
3. Summarizing operations status and inventory levels
4. Identifying risks and anomalies
5. Creating and managing purchase orders, invoices, products, vendors, customers, work orders, shipments, and BOMs
6. Updating inventory levels, recording payments, and managing approvals
7. Sending emails and following up with vendors or customers
8. Drafting invoices, contracts, reports, and memos
9. Explaining workflows and processes

CRITICAL: When a user asks you to create something, DO IT. If required data is missing (e.g., no vendor exists), create it or ask the user ONLY for the specific missing detail (vendor name, unit price). Never list manual steps. Never say "you need to first...". Just do it or ask one question, then do it.

Be concise, professional, and data-driven in your responses. When discussing financial figures, always format them properly with currency symbols.`;

        // Get conversation history
        const messages = await db.getAiMessages(input.conversationId);
        const chatHistory = messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        }));

        // Call LLM
        const response = await invokeLLM({
          messages: [
            { role: 'system', content: systemPrompt },
            ...chatHistory,
            { role: 'user', content: input.message },
          ],
        });

        const rawContent = response.choices[0]?.message?.content;
const assistantMessage = typeof rawContent === 'string' ? rawContent : 'I apologize, but I was unable to generate a response.';

        // Save assistant message
        await db.createAiMessage({
          conversationId: input.conversationId,
          role: 'assistant',
          content: assistantMessage,
        });

        // Update conversation timestamp
        await db.updateAiConversation(input.conversationId, {});

        return { message: assistantMessage };
      }),
    query: protectedProcedure
      .input(z.object({ question: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        // Get all relevant data for context
        const [metrics, recentInvoices, recentOrders, recentPOs] = await Promise.all([
          db.getDashboardMetrics(),
          db.getInvoices(),
          db.getOrders(),
          db.getPurchaseOrders(),
        ]);

        const systemPrompt = `You are an AI assistant for an ERP system. Answer the user's question based on the following business data:

Dashboard Metrics:
${JSON.stringify(metrics, null, 2)}

Recent Invoices (last 10):
${JSON.stringify(recentInvoices.slice(0, 10), null, 2)}

Recent Orders (last 10):
${JSON.stringify(recentOrders.slice(0, 10), null, 2)}

Recent Purchase Orders (last 10):
${JSON.stringify(recentPOs.slice(0, 10), null, 2)}

Provide a concise, data-driven answer. If you need to calculate something, show your work. Format numbers and currency properly.`;

        const response = await invokeLLM({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input.question },
          ],
        });

        const rawAnswer = response.choices[0]?.message?.content;
        return {
          answer: typeof rawAnswer === 'string' ? rawAnswer : 'Unable to process your question.',
        };
      }),

    // Comprehensive AI Agent Chat - handles all ERP operations
    agentChat: protectedProcedure
      .input(z.object({
        message: z.string().min(1),
        conversationHistory: z.array(z.object({
          role: z.enum(['system', 'user', 'assistant']),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const agentContext: AIAgentContext = {
          userId: ctx.user.id,
          userName: ctx.user.name || 'User',
          userRole: ctx.user.role,
          companyId: (ctx.user as any).companyId,
        };

        const result = await processAIAgentRequest(
          input.message,
          input.conversationHistory || [],
          agentContext
        );

        return result;
      }),

    // Quick analysis endpoint for data insights
    quickAnalysis: protectedProcedure
      .input(z.object({
        dataType: z.enum(['sales', 'inventory', 'vendors', 'customers', 'finances', 'orders', 'procurement', 'production']),
      }))
      .query(async ({ input, ctx }) => {
        const agentContext: AIAgentContext = {
          userId: ctx.user.id,
          userName: ctx.user.name || 'User',
          userRole: ctx.user.role,
          companyId: (ctx.user as any).companyId,
        };

        return getQuickAnalysis(input.dataType, agentContext);
      }),

    // System overview for dashboard
    systemOverview: protectedProcedure.query(async ({ ctx }) => {
      const agentContext: AIAgentContext = {
        userId: ctx.user.id,
        userName: ctx.user.name || 'User',
        userRole: ctx.user.role,
        companyId: (ctx.user as any).companyId,
      };

      return getSystemOverview(agentContext);
    }),

    // Pending actions that need attention
    pendingActions: protectedProcedure.query(async ({ ctx }) => {
      const agentContext: AIAgentContext = {
        userId: ctx.user.id,
        userName: ctx.user.name || 'User',
        userRole: ctx.user.role,
        companyId: (ctx.user as any).companyId,
      };

      return getPendingActions(agentContext);
    }),

    // Get suggested actions based on current system state
    suggestedActions: protectedProcedure.query(async ({ ctx }) => {
      // Get system state
      const metrics = await db.getDashboardMetrics();
      const pendingTasks = await db.getPendingApprovalTasks();

      const suggestions: { type: string; title: string; description: string; priority: string }[] = [];

      // Check for low inventory
      if ((metrics as any)?.lowStockItems && (metrics as any).lowStockItems > 0) {
        suggestions.push({
          type: 'inventory',
          title: 'Low Stock Alert',
          description: `${(metrics as any).lowStockItems} items are running low on stock`,
          priority: 'high',
        });
      }

      // Check for pending POs
      if (metrics?.pendingPurchaseOrders && metrics.pendingPurchaseOrders > 0) {
        suggestions.push({
          type: 'procurement',
          title: 'Pending Purchase Orders',
          description: `${metrics.pendingPurchaseOrders} purchase orders need attention`,
          priority: 'medium',
        });
      }

      // Check for pending approvals
      if (pendingTasks.length > 0) {
        suggestions.push({
          type: 'approvals',
          title: 'Pending Approvals',
          description: `${pendingTasks.length} AI tasks waiting for approval`,
          priority: 'high',
        });
      }

      // Check for overdue invoices
      if ((metrics as any)?.overdueInvoices && (metrics as any).overdueInvoices > 0) {
        suggestions.push({
          type: 'finance',
          title: 'Overdue Invoices',
          description: `${(metrics as any).overdueInvoices} invoices are past due`,
          priority: 'high',
        });
      }

      return suggestions;
    }),
  }),
  // ============================================
  // AI AGENT SYSTEM
  // ============================================
  aiAgent: router({
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
      
      create: protectedProcedure
        .input(z.object({
          taskType: z.enum(['generate_po', 'send_rfq', 'send_quote_request', 'send_email', 'update_inventory', 'create_shipment', 'generate_invoice', 'reconcile_payment', 'reorder_materials', 'vendor_followup', 'create_work_order', 'query', 'reply_email', 'approve_po', 'approve_invoice', 'create_vendor', 'create_material', 'create_product', 'create_bom', 'create_customer']),
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
          await syncAgentStatusToProjectTask(input.id);
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
          await syncAgentStatusToProjectTask(input.id);
          return { success: true };
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
          try {
            JSON.parse(input.taskData);
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
          
          await db.updateAiAgentTask(input.id, {
            taskData: input.taskData,
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
          await syncAgentStatusToProjectTask(input.id);

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
                
                for (const vendorId of vendorIds) {
                  const vendor = await db.getVendorById(vendorId);
                  if (vendor && vendor.email) {
                    const emailResult = await sendEmail({
                      to: vendor.email,
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
                    });
                    if (emailResult.success) {
                      emailsSent.push(vendor.email);
                    }
                  }
                }
                
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

              case 'query': {
                // Generic "query" tasks can carry structured actions from other automations.
                if (taskData.action === 'create_project_task') {
                  if (!taskData.projectId || !taskData.name) {
                    throw new Error('Project task suggestion missing projectId or name');
                  }
                  const created = await db.createProjectTask({
                    projectId: Number(taskData.projectId),
                    name: String(taskData.name),
                    description: taskData.description ? String(taskData.description) : undefined,
                    priority: (taskData.priority || 'medium') as any,
                    status: 'todo',
                    assigneeId: taskData.assigneeId ? Number(taskData.assigneeId) : undefined,
                    createdBy: ctx.user.id,
                  } as any);
                  result = {
                    created: true,
                    action: 'create_project_task',
                    projectTaskId: created.id,
                    projectId: Number(taskData.projectId),
                    assigneeId: taskData.assigneeId ? Number(taskData.assigneeId) : null,
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

            await syncAgentStatusToProjectTask(input.id);
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

            await syncAgentStatusToProjectTask(input.id);
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
  }),
  // ============================================
  // AI PRODUCTION FORECASTING
  // ============================================
  forecasting: router({
    // Get demand forecasts
    getForecasts: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        productId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getDemandForecasts(input);
      }),

    // Get single forecast
    getForecast: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getDemandForecastById(input.id);
      }),

    // Generate AI forecast for products
    generateForecast: protectedProcedure
      .input(z.object({
        productIds: z.array(z.number()).optional(), // If empty, forecast all products
        forecastMonths: z.number().default(3), // How many months ahead to forecast
        historyMonths: z.number().default(12), // How many months of history to analyze
      }))
      .mutation(async ({ input, ctx }) => {
        const { invokeLLM } = await import('../_core/llm');
        
        // Get products to forecast
        let productsToForecast = await db.getProducts();
        if (input.productIds && input.productIds.length > 0) {
          productsToForecast = productsToForecast.filter(p => input.productIds!.includes(p.id));
        }
        
        // Get historical sales data
        const historicalData = await db.getHistoricalSalesData(undefined, input.historyMonths);
        
        // Group by product and month
        const salesByProductMonth: Record<number, Record<string, number>> = {};
        for (const sale of historicalData) {
          if (!sale.productId) continue;
          if (!salesByProductMonth[sale.productId]) salesByProductMonth[sale.productId] = {};
          const monthKey = sale.orderDate ? new Date(sale.orderDate).toISOString().slice(0, 7) : 'unknown';
          salesByProductMonth[sale.productId][monthKey] = (salesByProductMonth[sale.productId][monthKey] || 0) + parseFloat(sale.quantity?.toString() || '0');
        }
        
        const forecasts = [];
        
        for (const product of productsToForecast) {
          const productSales = salesByProductMonth[product.id] || {};
          const salesHistory = Object.entries(productSales)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, qty]) => ({ month, quantity: qty }));
          
          // Use AI to analyze and forecast
          const prompt = `You are a demand forecasting AI for an ERP system. Analyze the following sales history for product "${product.name}" and predict demand for the next ${input.forecastMonths} months.

Historical Sales Data:
${salesHistory.length > 0 ? salesHistory.map(s => `${s.month}: ${s.quantity} units`).join('\n') : 'No historical data available - use reasonable estimates based on product type'}

Product Details:
- Name: ${product.name}
- SKU: ${product.sku || 'N/A'}
- Category: ${product.category || 'General'}
- Current Price: $${product.unitPrice || 0}

Provide your forecast in JSON format with the following structure:
{
  "forecastedQuantity": <total units for forecast period>,
  "confidenceLevel": <0-100 percentage>,
  "trendDirection": "up" | "down" | "stable",
  "analysis": "<brief explanation of your forecast reasoning>",
  "monthlyBreakdown": [{ "month": "YYYY-MM", "quantity": <number> }]
}`;

          try {
            const response = await invokeLLM({
              messages: [
                { role: 'system', content: 'You are an expert demand forecasting analyst. Always respond with valid JSON.' },
                { role: 'user', content: prompt }
              ],
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: 'demand_forecast',
                  strict: true,
                  schema: {
                    type: 'object',
                    properties: {
                      forecastedQuantity: { type: 'number' },
                      confidenceLevel: { type: 'number' },
                      trendDirection: { type: 'string', enum: ['up', 'down', 'stable'] },
                      analysis: { type: 'string' },
                      monthlyBreakdown: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            month: { type: 'string' },
                            quantity: { type: 'number' }
                          },
                          required: ['month', 'quantity'],
                          additionalProperties: false
                        }
                      }
                    },
                    required: ['forecastedQuantity', 'confidenceLevel', 'trendDirection', 'analysis', 'monthlyBreakdown'],
                    additionalProperties: false
                  }
                }
              }
            });
            
            const content = response.choices[0]?.message?.content;
            const forecastData = typeof content === 'string' ? JSON.parse(content) : null;
            
            if (forecastData) {
              const now = new Date();
              const periodStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
              const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1 + input.forecastMonths, 0);
              
              const result = await db.createDemandForecast({
                productId: product.id,
                forecastDate: now,
                forecastPeriodStart: periodStart,
                forecastPeriodEnd: periodEnd,
                forecastedQuantity: forecastData.forecastedQuantity.toString(),
                confidenceLevel: forecastData.confidenceLevel.toString(),
                forecastMethod: 'ai_trend',
                dataPointsUsed: salesHistory.length,
                aiAnalysis: forecastData.analysis,
                trendDirection: forecastData.trendDirection,
                status: 'active',
                createdBy: ctx.user?.id,
              });
              
              forecasts.push({ productId: product.id, productName: product.name, ...result, ...forecastData });
            }
          } catch (error) {
            console.error(`Forecast error for product ${product.id}:`, error);
            // Create a basic forecast even if AI fails
            const avgSales = salesHistory.length > 0 
              ? salesHistory.reduce((sum, s) => sum + s.quantity, 0) / salesHistory.length 
              : 100;
            
            const now = new Date();
            const periodStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1 + input.forecastMonths, 0);
            
            const result = await db.createDemandForecast({
              productId: product.id,
              forecastDate: now,
              forecastPeriodStart: periodStart,
              forecastPeriodEnd: periodEnd,
              forecastedQuantity: (avgSales * input.forecastMonths).toFixed(0),
              confidenceLevel: '50',
              forecastMethod: 'historical_avg',
              dataPointsUsed: salesHistory.length,
              aiAnalysis: 'Forecast based on historical average (AI analysis unavailable)',
              trendDirection: 'stable',
              status: 'active',
              createdBy: ctx.user?.id,
            });
            
            forecasts.push({ productId: product.id, productName: product.name, ...result });
          }
        }
        
        return { forecasts, count: forecasts.length };
      }),

    // Get production plans
    getProductionPlans: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        productId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getProductionPlans(input);
      }),

    // Generate production plan from forecast
    generateProductionPlan: protectedProcedure
      .input(z.object({
        demandForecastId: z.number(),
        safetyStockPercent: z.number().default(20), // Add 20% safety stock
      }))
      .mutation(async ({ input, ctx }) => {
        const forecast = await db.getDemandForecastById(input.demandForecastId);
        if (!forecast) throw new Error('Forecast not found');
        
        const product = forecast.productId ? await db.getProductById(forecast.productId) : null;
        if (!product) throw new Error('Product not found');
        
        // Get current inventory
        const inventoryRecords = await db.getInventory(undefined, { productId: product.id });
        const currentInventory = inventoryRecords.reduce((sum, inv) => sum + parseFloat(inv.quantity?.toString() || '0'), 0);
        
        // Calculate production needed
        const forecastedQty = parseFloat(forecast.forecastedQuantity?.toString() || '0');
        const safetyStock = forecastedQty * (input.safetyStockPercent / 100);
        const plannedQuantity = Math.max(0, forecastedQty + safetyStock - currentInventory);
        
        // Get BOM for this product
        const boms = await db.getBillOfMaterials({ productId: product.id });
        const bom = boms[0];
        
        // Create production plan
        const plan = await db.createProductionPlan({
          demandForecastId: forecast.id,
          productId: product.id,
          bomId: bom?.id,
          plannedQuantity: plannedQuantity.toFixed(0),
          unit: 'EA',
          plannedStartDate: forecast.forecastPeriodStart || undefined,
          plannedEndDate: forecast.forecastPeriodEnd || undefined,
          currentInventory: currentInventory.toFixed(0),
          safetyStock: safetyStock.toFixed(0),
          status: 'draft',
          createdBy: ctx.user?.id,
        });
        
        // If we have a BOM, calculate material requirements
        if (bom) {
          const components = await db.getBomComponents(bom.id);
          
          for (const comp of components) {
            if (!comp.rawMaterialId) continue;
            
            const requiredQty = parseFloat(comp.quantity?.toString() || '0') * plannedQuantity;
            
            // Get current raw material inventory
            const rmInventory = await db.getRawMaterialInventory({ rawMaterialId: comp.rawMaterialId });
            const currentRmQty = rmInventory.reduce((sum, inv) => sum + parseFloat(inv.quantity?.toString() || '0'), 0);
            
            // Get pending orders
            const pendingOrders = await db.getPendingOrdersForMaterial(comp.rawMaterialId);
            const onOrderQty = pendingOrders.reduce((sum, po) => {
              const ordered = parseFloat(po.quantity?.toString() || '0');
              const received = parseFloat(po.receivedQuantity?.toString() || '0');
              return sum + (ordered - received);
            }, 0);
            
            const shortageQty = Math.max(0, requiredQty - currentRmQty - onOrderQty);
            
            // Get preferred vendor and estimated cost
            const vendor = await db.getPreferredVendorForMaterial(comp.rawMaterialId);
            const rawMaterial = await db.getRawMaterialById(comp.rawMaterialId);
            const unitCost = parseFloat(rawMaterial?.unitCost?.toString() || '0');
            
            await db.createMaterialRequirement({
              productionPlanId: plan.id,
              rawMaterialId: comp.rawMaterialId,
              requiredQuantity: requiredQty.toFixed(4),
              unit: comp.unit || 'KG',
              currentInventory: currentRmQty.toFixed(4),
              onOrderQuantity: onOrderQty.toFixed(4),
              shortageQuantity: shortageQty.toFixed(4),
              suggestedOrderQuantity: (shortageQty * 1.1).toFixed(4), // Add 10% buffer
              preferredVendorId: vendor?.id,
              estimatedUnitCost: unitCost.toFixed(4),
              estimatedTotalCost: (shortageQty * 1.1 * unitCost).toFixed(2),
              leadTimeDays: 14, // Default lead time
              status: 'pending',
            });
          }
        }
        
        return plan;
      }),

    // Get material requirements for a plan
    getMaterialRequirements: protectedProcedure
      .input(z.object({ productionPlanId: z.number() }))
      .query(async ({ input }) => {
        return db.getMaterialRequirements(input.productionPlanId);
      }),

    // Get suggested purchase orders
    getSuggestedPOs: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getSuggestedPurchaseOrders(input);
      }),

    // Get suggested PO details
    getSuggestedPO: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const po = await db.getSuggestedPurchaseOrderById(input.id);
        const items = await db.getSuggestedPoItems(input.id);
        return { ...po, items };
      }),

    // Generate suggested POs from production plan
    generateSuggestedPOs: protectedProcedure
      .input(z.object({ productionPlanId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const plan = await db.getProductionPlanById(input.productionPlanId);
        if (!plan) throw new Error('Production plan not found');
        
        const requirements = await db.getMaterialRequirements(input.productionPlanId);
        const shortages = requirements.filter(r => parseFloat(r.shortageQuantity?.toString() || '0') > 0);
        
        if (shortages.length === 0) {
          return { suggestedPOs: [], message: 'No material shortages - no POs needed' };
        }
        
        // Group by vendor
        const byVendor: Record<number, typeof shortages> = {};
        for (const shortage of shortages) {
          const vendorId = shortage.preferredVendorId || 0;
          if (!byVendor[vendorId]) byVendor[vendorId] = [];
          byVendor[vendorId].push(shortage);
        }
        
        const suggestedPOs = [];
        const now = new Date();
        const requiredByDate = plan.plannedStartDate ? new Date(plan.plannedStartDate) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
        
        for (const [vendorIdStr, items] of Object.entries(byVendor)) {
          const vendorId = parseInt(vendorIdStr);
          if (vendorId === 0) continue; // Skip items without vendor
          
          // Get vendor details including lead time
          const vendor = await db.getVendorById(vendorId);
          const vendorLeadTimeDays = vendor?.defaultLeadTimeDays || 14; // Default 14 days if not set
          
          // Calculate delivery dates based on lead time
          const estimatedDeliveryDate = new Date(now.getTime() + vendorLeadTimeDays * 24 * 60 * 60 * 1000);
          const daysUntilRequired = Math.ceil((requiredByDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          const isUrgent = vendorLeadTimeDays > daysUntilRequired;
          
          // Calculate latest order date (required date minus lead time)
          const latestOrderDate = new Date(requiredByDate.getTime() - vendorLeadTimeDays * 24 * 60 * 60 * 1000);
          const suggestedOrderDate = latestOrderDate < now ? now : latestOrderDate;
          
          const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.estimatedTotalCost?.toString() || '0'), 0);
          
          // Calculate priority based on lead time urgency and shortage severity
          const avgShortageRatio = items.reduce((sum, item) => {
            const required = parseFloat(item.requiredQuantity?.toString() || '1');
            const shortage = parseFloat(item.shortageQuantity?.toString() || '0');
            return sum + (shortage / required);
          }, 0) / items.length;
          
          // Boost priority if urgent (lead time exceeds available time)
          let priorityScore = Math.round(avgShortageRatio * 70); // Base score from shortage
          if (isUrgent) {
            priorityScore += 30; // Urgent boost
          } else if (daysUntilRequired - vendorLeadTimeDays < 7) {
            priorityScore += 15; // Near-urgent boost
          }
          priorityScore = Math.min(100, priorityScore);
          
          // Use AI to generate rationale including lead time info
          const { invokeLLM } = await import('../_core/llm');
          let aiRationale = '';
          try {
            const response = await invokeLLM({
              messages: [
                { role: 'system', content: 'You are an ERP procurement assistant. Provide brief, professional rationale for purchase orders.' },
                { role: 'user', content: `Generate a brief rationale (2-3 sentences) for this suggested purchase order:
- Vendor: ${vendor?.name || 'Unknown'}
- Vendor Lead Time: ${vendorLeadTimeDays} days
- Items: ${items.length} raw materials
- Total Amount: $${totalAmount.toFixed(2)}
- Required By: ${requiredByDate.toLocaleDateString()}
- Days Until Required: ${daysUntilRequired}
- Is Urgent: ${isUrgent ? 'YES - Lead time exceeds available time!' : 'No'}
- Estimated Delivery: ${estimatedDeliveryDate.toLocaleDateString()}
- Priority Score: ${priorityScore}/100
- Materials needed for production plan ${plan.planNumber}` }
              ]
            });
            aiRationale = typeof response.choices[0]?.message?.content === 'string' 
              ? response.choices[0].message.content 
              : 'Purchase order suggested based on production requirements and inventory analysis.';
          } catch {
            aiRationale = isUrgent 
              ? `URGENT: Lead time (${vendorLeadTimeDays} days) exceeds available time (${daysUntilRequired} days). Order immediately to minimize production delays.`
              : `Purchase order suggested based on production requirements. Vendor lead time: ${vendorLeadTimeDays} days. Order by ${latestOrderDate.toLocaleDateString()} for on-time delivery.`;
          }
          
          const suggestedPo = await db.createSuggestedPurchaseOrder({
            vendorId,
            productionPlanId: plan.id,
            totalAmount: totalAmount.toFixed(2),
            currency: 'USD',
            suggestedOrderDate,
            requiredByDate,
            estimatedDeliveryDate,
            vendorLeadTimeDays,
            daysUntilRequired,
            isUrgent,
            aiRationale,
            priorityScore,
            status: 'pending',
          });
          
          // Create line items and update material requirements with lead time info
          for (const item of items) {
            const rawMaterial = await db.getRawMaterialById(item.rawMaterialId);
            // Use material-specific lead time if available, otherwise vendor default
            const materialLeadTime = rawMaterial?.leadTimeDays || vendorLeadTimeDays;
            const materialDeliveryDate = new Date(now.getTime() + materialLeadTime * 24 * 60 * 60 * 1000);
            const materialLatestOrderDate = new Date(requiredByDate.getTime() - materialLeadTime * 24 * 60 * 60 * 1000);
            const materialIsUrgent = materialLeadTime > daysUntilRequired;
            
            // Update material requirement with lead time calculations
            await db.updateMaterialRequirement(item.id, {
              leadTimeDays: materialLeadTime,
              requiredByDate,
              latestOrderDate: materialLatestOrderDate,
              estimatedDeliveryDate: materialDeliveryDate,
              isUrgent: materialIsUrgent,
            });
            
            await db.createSuggestedPoItem({
              suggestedPoId: suggestedPo.id,
              materialRequirementId: item.id,
              rawMaterialId: item.rawMaterialId,
              description: rawMaterial?.name || 'Raw Material',
              quantity: item.suggestedOrderQuantity || '0',
              unit: item.unit || 'KG',
              unitPrice: item.estimatedUnitCost || '0',
              totalAmount: item.estimatedTotalCost || '0',
            });
          }
          
          suggestedPOs.push({
            ...suggestedPo,
            vendorName: vendor?.name,
            vendorLeadTimeDays,
            estimatedDeliveryDate,
            isUrgent,
            daysUntilRequired,
          });
        }
        
        return { suggestedPOs, count: suggestedPOs.length };
      }),

    // One-click approve suggested PO (convert to actual PO)
    approveSuggestedPO: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.convertSuggestedPoToActualPo(input.id, ctx.user?.id || 0);
        return result;
      }),

    // Reject suggested PO
    rejectSuggestedPO: protectedProcedure
      .input(z.object({ id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateSuggestedPurchaseOrder(input.id, {
          status: 'rejected',
          rejectedBy: ctx.user?.id,
          rejectedAt: new Date(),
          rejectionReason: input.reason,
        });
        return { success: true };
      }),

    // Get forecasting dashboard summary
    getDashboardSummary: protectedProcedure.query(async () => {
      const activeForecasts = await db.getDemandForecasts({ status: 'active' });
      const pendingPlans = await db.getProductionPlans({ status: 'draft' });
      const pendingSuggestedPOs = await db.getSuggestedPurchaseOrders({ status: 'pending' });
      
      const totalForecastedDemand = activeForecasts.reduce((sum, f) => sum + parseFloat(f.forecastedQuantity?.toString() || '0'), 0);
      const totalPendingPOValue = pendingSuggestedPOs.reduce((sum, po) => sum + parseFloat(po.totalAmount?.toString() || '0'), 0);
      
      return {
        activeForecasts: activeForecasts.length,
        pendingPlans: pendingPlans.length,
        pendingSuggestedPOs: pendingSuggestedPOs.length,
        totalForecastedDemand,
        totalPendingPOValue,
        forecasts: activeForecasts.slice(0, 5),
        suggestedPOs: pendingSuggestedPOs.slice(0, 5),
      };
    }),
  }),
  // ============================================
  // ALERT SYSTEM
  // ============================================
  alerts: router({
    list: protectedProcedure
      .input(z.object({
        type: z.enum(['low_stock', 'shortage', 'late_shipment', 'yield_variance', 'reconciliation_variance', 'expiring_lot', 'other']).optional(),
        status: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']).optional(),
        severity: z.enum(['info', 'warning', 'critical']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getAlerts(input);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getAlertById(input.id);
      }),
    acknowledge: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.acknowledgeAlert(input.id, ctx.user!.id);
        return { success: true };
      }),
    resolve: protectedProcedure
      .input(z.object({ id: z.number(), notes: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await db.resolveAlert(input.id, ctx.user!.id, input.notes);
        return { success: true };
      }),
    dismiss: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateAlert(input.id, { status: 'dismissed' });
        return { success: true };
      }),
    generateLowStockAlerts: protectedProcedure
      .mutation(async () => {
        const alertIds = await db.generateLowStockAlerts();
        return { created: alertIds.length, alertIds };
      }),
    create: protectedProcedure
      .input(z.object({
        type: z.enum(['low_stock', 'shortage', 'late_shipment', 'yield_variance', 'reconciliation_variance', 'expiring_lot', 'quality_issue', 'po_overdue']),
        severity: z.enum(['info', 'warning', 'critical']),
        title: z.string(),
        description: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.number().optional(),
        assignedTo: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return db.createAlert(input);
      }),
  }),
  // Recommendations
  recommendations: router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'expired']).optional(),
        type: z.enum(['reorder', 'production', 'pricing', 'allocation', 'other']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRecommendations(input);
      }),
    approve: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.approveRecommendation(input.id, ctx.user!.id);
        return { success: true };
      }),
    reject: protectedProcedure
      .input(z.object({ id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await db.rejectRecommendation(input.id, ctx.user!.id, input.reason);
        return { success: true };
      }),
  }),
});
