// appRouter.investorUpdates — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { createAuditLog } from "./_shared";

// Investor Updates
export const investorUpdatesRouter = router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional(), status: z.string().optional() }).optional())
      .query(({ input }) => db.getInvestorUpdates(input)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getInvestorUpdateById(input.id)),
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        period: z.string().optional(),
        type: z.enum(["quarterly", "monthly", "annual", "ad_hoc"]).optional(),
        content: z.string().optional(),
        highlights: z.string().optional(),
        asks: z.string().optional(),
        callsToAction: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createInvestorUpdate({ ...input, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'investorUpdate', result.id, input.title);
        return result;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        highlights: z.string().optional(),
        asks: z.string().optional(),
        callsToAction: z.string().optional(),
        status: z.enum(["draft", "review", "sent"]).optional(),
        sentAt: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateInvestorUpdate(id, data as any);
        return { success: true };
      }),
    generate: protectedProcedure
      .input(z.object({ period: z.string().optional() }).optional())
      .mutation(async () => {
        // Fetch data with graceful fallbacks so a single table error doesn't break the report
        const safeQuery = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
          try { return await fn(); } catch { return fallback; }
        };
        const [orders, invoices, customers, vendors, employees, inventory, purchaseOrders] = await Promise.all([
          safeQuery(() => db.getOrders(), []),
          safeQuery(() => db.getInvoices(), []),
          safeQuery(() => db.getCustomers(), []),
          safeQuery(() => db.getVendors(), []),
          safeQuery(() => db.getEmployees(), []),
          safeQuery(() => db.getInventory(), []),
          safeQuery(() => db.getPurchaseOrders(), []),
        ]);
        const revenue = invoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + parseFloat(i.totalAmount || '0'), 0);
        const prompt = `Generate a professional quarterly investor update for Superhumn Inc.
Data: Revenue: $${revenue.toLocaleString()}, Orders: ${orders.length}, Customers: ${customers.length}, Vendors: ${vendors.length}, Team: ${employees.length}, Inventory items: ${inventory.length}, Active POs: ${purchaseOrders.length}
Format as markdown with: TL;DR (3 bullets), Financial Highlights, Operations, Team, Milestones, Asks (3 specific requests), Next Quarter Outlook`;
        const response = await invokeLLM({ messages: [
          { role: "system", content: "You are a startup CEO writing to investors. Be concise, data-driven, and optimistic but honest." },
          { role: "user", content: prompt },
        ]});
        const content = response.choices?.[0]?.message?.content || "Report generation failed";
        return { content: typeof content === 'string' ? content : String(content) };
      }),
  });
