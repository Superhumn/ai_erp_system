// appRouter.ai — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { processAIAgentRequest, processAIAgentRequestStream, planAIAgentRequest, getQuickAnalysis, getSystemOverview, getPendingActions, type AIAgentContext } from "../aiAgentService";
import * as db from "../db";
import { internalProcedure } from "./_shared";

// ============================================
// AI ASSISTANT
// ============================================
export const aiRouter = router({
    conversations: protectedProcedure.query(({ ctx }) => db.getAiConversations(ctx.user.id)),
    getConversation: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        // Conversations are private to their owner; a foreign id reads as not found.
        const conversation = await db.getAiConversationById(input.id);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
        }
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
        // Conversations are private to their owner; a foreign id reads as not found.
        const conversation = await db.getAiConversationById(input.conversationId);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
        }

        // Save user message
        await db.createAiMessage({
          conversationId: input.conversationId,
          role: 'user',
          content: input.message,
        });

        // Get dashboard metrics for context
        const metrics = await db.getDashboardMetrics();
        
        // Build system prompt with ERP context. This endpoint has NO tools wired
        // to it: it is a read-only Q&A over the metrics below. Anything that
        // changes data goes through the AI command bar (ai.agentChat), whose
        // tools are role-gated and company-scoped server-side.
        const systemPrompt = `You are the AI assistant for the Superhumn ERP system. In this conversation you can only READ: you answer questions and give analysis from the business metrics below. You have no tools here, so you cannot create, update, send, archive or delete anything — never claim that you did.

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

You can help with:
1. Answering questions about business metrics and KPIs
2. Insights on financial health, cash flow, and revenue
3. Summarising operations status and inventory levels
4. Identifying risks and anomalies
5. Drafting text the user can use (emails, memos, report outlines)
6. Explaining workflows and where things live in the app

When the user asks you to create, update or manage something, tell them to use the AI command bar at the top of the page, which can (subject to their role): create and update vendors and customers; create, update, cancel and fulfil sales orders; create invoices, mark them sent and record payments; create draft purchase orders and work orders; adjust or transfer inventory; create freight RFQs and book carrier quotes; send emails and create calendar events; and queue multi-step errands for approval. Give them the exact phrasing to type, e.g. "create a PO for 500 kg of oat flour from Pacific Foods at $1.20/kg" or "record a $1,200 wire payment on INV-2609-0007".

Be concise, professional, and data-driven. Format financial figures with currency symbols.`;

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
    query: internalProcedure
      .input(z.object({ question: z.string().min(1), context: z.record(z.string(), z.unknown()).optional() }))
      .mutation(async ({ input, ctx }) => {
        // Get all relevant data for context
        const [metrics, recentInvoices, recentOrders, recentPOs] = await Promise.all([
          db.getDashboardMetrics(),
          db.getInvoices(),
          db.getOrders(),
          db.getPurchaseOrders(),
        ]);

        const systemPrompt = `You are the AI assistant for Superhumn's ERP system. You can read and analyze business data.

IMPORTANT: You do NOT have write access. Do NOT pretend to create, update, or delete records. If a user asks you to create something (a PO, invoice, vendor, etc.), tell them clearly that you are a read-only assistant and guide them to use the AI command bar at the top of the page with the exact phrasing they need.

For navigation questions, always give the exact location:
- Purchase Orders are in the Operations section at path /operations/purchase-orders
- Vendors are in the Operations section at path /operations/vendors
- Invoices are in the Finance section
- Orders are in the Sales section

For creation requests, guide the user to type a command directly in the search bar at the top, for example:
- To create a PO: type "make po for 3 tons of hemp protein" in the search bar
- To create a vendor: type "create vendor Pacific Foods" in the search bar

Current Business Data:
- Invoices: ${recentInvoices.length} total
- Orders: ${recentOrders.length} total
- Purchase Orders: ${recentPOs.length} total
- Dashboard: ${JSON.stringify(metrics)}

Be concise and helpful. Always give actionable guidance.`;

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
        message: z.string().min(1).max(10000),
        // Only user/assistant turns — the system prompt is server-owned and must
        // not be injectable by the client (prompt injection / privilege escalation).
        // Bounded in count and size to limit token abuse.
        conversationHistory: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(10000),
        })).max(50).optional(),
        // "act" (default): the agent executes immediately.
        // "plan": the agent returns a plan for the user to approve; nothing runs.
        mode: z.enum(['act', 'plan']).optional(),
        // When executing an approved plan, pass its text so the agent follows it.
        approvedPlan: z.string().max(20000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const agentContext: AIAgentContext = {
          userId: ctx.user.id,
          userName: ctx.user.name || 'User',
          userRole: ctx.user.role,
          companyId: (ctx.user as any).companyId,
        };

        const history = input.conversationHistory || [];

        // Plan-first mode: describe what would happen, take no action.
        if (input.mode === 'plan') {
          return planAIAgentRequest(input.message, history, agentContext);
        }

        // Execute. If an approved plan was supplied, include it as guidance for
        // the agent. Note this steers the model via the prompt — it's not a hard
        // constraint, so the agent should follow the plan but may adapt if
        // reality differs from what the plan assumed. Cap the plan portion so the
        // combined prompt stays bounded regardless of the per-field input limits.
        const MAX_PLAN_CHARS = 8000;
        const planText = input.approvedPlan
          ? (input.approvedPlan.length > MAX_PLAN_CHARS
              ? `${input.approvedPlan.slice(0, MAX_PLAN_CHARS)}…`
              : input.approvedPlan)
          : undefined;
        const message = planText
          ? `${input.message}\n\nThe user reviewed and approved the following plan. Follow it as closely as possible, adjusting only where necessary:\n${planText}`
          : input.message;

        const result = await processAIAgentRequest(message, history, agentContext);

        return result;
      }),

    // Streaming version of agentChat — same inputs and semantics, but the answer
    // is delivered token-by-token (async generator) so the UI can type it out
    // live. Consumed via the vanilla client's `.mutate()` (react-query's
    // useMutation cannot iterate an async iterable). Plan mode returns a single
    // terminal `done` event carrying the plan, matching agentChat's shape.
    agentChatStream: protectedProcedure
      .input(z.object({
        message: z.string().min(1).max(10000),
        conversationHistory: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(10000),
        })).max(50).optional(),
        mode: z.enum(['act', 'plan']).optional(),
        approvedPlan: z.string().max(20000).optional(),
      }))
      .mutation(async function* ({ input, ctx, signal }) {
        const agentContext: AIAgentContext = {
          userId: ctx.user.id,
          userName: ctx.user.name || 'User',
          userRole: ctx.user.role,
          companyId: (ctx.user as any).companyId,
        };

        const history = input.conversationHistory || [];

        // Plan-first mode: build the plan (non-streamed) and emit it as the single
        // terminal event. The client handles isPlan exactly as with agentChat.
        if (input.mode === 'plan') {
          const plan = await planAIAgentRequest(input.message, history, agentContext);
          yield { type: 'done' as const, response: plan };
          return;
        }

        const MAX_PLAN_CHARS = 8000;
        const planText = input.approvedPlan
          ? (input.approvedPlan.length > MAX_PLAN_CHARS
              ? `${input.approvedPlan.slice(0, MAX_PLAN_CHARS)}…`
              : input.approvedPlan)
          : undefined;
        const message = planText
          ? `${input.message}\n\nThe user reviewed and approved the following plan. Follow it as closely as possible, adjusting only where necessary:\n${planText}`
          : input.message;

        yield* processAIAgentRequestStream(message, history, agentContext, { signal });
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
      const metrics = await db.getDashboardMetrics() as any;
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
  });
