// appRouter.aiAgent — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { processEmailReply, analyzeEmail, generateEmailReply } from "../emailReplyService";
import * as db from "../db";
import { claimAgentTask, executeAgentTask } from "../aiAgentTaskExecutor";
import { adminProcedure, internalProcedure, createAuditLog } from "./_shared";

// ============================================
// AI AGENT SYSTEM
// ============================================

/**
 * Push an agent task's new status onto the project task it was assigned from
 * (if any), so the project page and its owner see the result immediately
 * rather than on the next task read. Never fails the calling mutation.
 */
async function writeBackToProjectTask(agentTaskId: number): Promise<void> {
  try {
    const { syncAgentStatusToProjectTask } = await import("../taskAgentBridge");
    await syncAgentStatusToProjectTask(agentTaskId);
  } catch (err) {
    console.warn(`[aiAgent] project-task write-back failed for task ${agentTaskId}:`, err);
  }
}

/**
 * Persist a successful execution: status, result, audit log, a notification
 * to whoever approved (or requested) the task — the executing admin is the
 * fallback — and the project-task write-back. The notification is best-effort
 * so a notification hiccup never turns a completed task into a failed one.
 */
async function recordExecutionSuccess(
  task: NonNullable<Awaited<ReturnType<typeof db.getAiAgentTaskById>>>,
  result: Record<string, any>,
  ctxUser: { id: number },
  logMessage: string,
): Promise<void> {
  await db.updateAiAgentTask(task.id, {
    status: 'completed',
    executedAt: new Date(),
    executionResult: JSON.stringify(result),
  });
  await db.createAiAgentLog({
    taskId: task.id,
    action: 'task_executed',
    status: 'success',
    message: logMessage,
    details: JSON.stringify(result),
  });

  try {
    let taskData: any = {};
    try { taskData = JSON.parse(task.taskData || '{}'); } catch { taskData = {}; }
    const notifyUserId = task.approvedBy ?? (Number(taskData?.createdBy ?? taskData?.requestedBy) || ctxUser.id);
    const label = task.taskType.replace(/_/g, ' ');
    await db.createNotification({
      userId: notifyUserId,
      type: 'success',
      title: `AI task completed: ${label}`,
      message: result?.poNumber
        ? `Task #${task.id} created draft purchase order ${result.poNumber}.`
        : `Task #${task.id} (${label}) executed successfully.`,
      entityType: 'ai_agent_task',
      entityId: task.id,
      link: '/ai/approvals',
      metadata: { taskType: task.taskType, result },
    });
  } catch (err) {
    console.warn(`[aiAgent] completion notification failed for task ${task.id}:`, err);
  }

  await writeBackToProjectTask(task.id);
}

/** Persist a failed execution (status, retry count, audit log, write-back). */
async function recordExecutionFailure(
  task: NonNullable<Awaited<ReturnType<typeof db.getAiAgentTaskById>>>,
  error: string,
  logMessage: string,
): Promise<void> {
  await db.updateAiAgentTask(task.id, {
    status: 'failed',
    errorMessage: error,
    retryCount: (task.retryCount || 0) + 1,
  });
  await db.createAiAgentLog({
    taskId: task.id,
    action: 'task_failed',
    status: 'error',
    message: logMessage,
  });
  await writeBackToProjectTask(task.id);
}

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
      
      bulkDelete: adminProcedure
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
              await writeBackToProjectTask(input.id);
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

          await writeBackToProjectTask(input.id);
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
          await writeBackToProjectTask(input.id);
          return { success: true };
        }),

      // Inline approval for concierge errands: approve + run in a single step
      // straight from the AI chat, instead of parking the task in the Approval
      // Queue. The claim moves pending_approval -> in_progress atomically
      // (never passing through the 'approved' state the background scheduler
      // watches), so the errand can never be double-executed.
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

          const claimed = await claimAgentTask(input.id, 'pending_approval', {
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          });
          if (!claimed) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Errand was already approved or executed by someone else' });
          }
          await db.createAiAgentLog({
            taskId: input.id,
            action: 'task_approved',
            status: 'success',
            message: `Errand approved inline by ${ctx.user.name}`,
          });

          const outcome = await executeAgentTask(task, { executedBy: ctx.user.id, executedByName: ctx.user.name ?? undefined });
          if (outcome.success === false) {
            await recordExecutionFailure(task, outcome.error, `Errand execution failed: ${outcome.error}`);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: outcome.error });
          }
          await recordExecutionSuccess(task, outcome.data, ctx.user, 'Errand executed successfully (inline approval)');
          return { success: true, result: outcome.data };
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

          // Compare-and-set approved -> in_progress so this click and the
          // background scheduler (or a second click) cannot both run the task.
          const claimed = await claimAgentTask(input.id, 'approved');
          if (!claimed) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Task is already being executed' });
          }

          const outcome = await executeAgentTask(task, { executedBy: ctx.user.id, executedByName: ctx.user.name ?? undefined });
          if (outcome.success === false) {
            await recordExecutionFailure(task, outcome.error, `Task execution failed: ${outcome.error}`);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: outcome.error });
          }
          await recordExecutionSuccess(task, outcome.data, ctx.user, 'Task executed successfully');
          return { success: true, result: outcome.data };
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
