import { z } from "zod";
import * as db from "../db";
import { invokeLLM } from "../_core/llm";
import { router, protectedProcedure, createAuditLog } from "./middleware";

export const investorUpdatesRouter = router({
  investorUpdates: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        type: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getInvestorUpdates(input)),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getInvestorUpdateById(input.id)),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
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
        period: z.string().optional(),
        type: z.enum(["quarterly", "monthly", "annual", "ad_hoc"]).optional(),
        content: z.string().optional(),
        highlights: z.string().optional(),
        asks: z.string().optional(),
        callsToAction: z.string().optional(),
        status: z.enum(["draft", "review", "sent"]).optional(),
        sentAt: z.date().optional(),
        sentTo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateInvestorUpdate(id, data);
        await createAuditLog(ctx.user.id, 'update', 'investorUpdate', id);
        return { success: true };
      }),

    generate: protectedProcedure
      .input(z.object({
        period: z.string().optional(),
        companyName: z.string().optional(),
      }).optional())
      .mutation(async ({ input }) => {
        const period = input?.period || getCurrentQuarter();
        const companyName = input?.companyName || "Superhumn Inc";

        // Gather ERP data
        const [orders, invoices, customers, vendors, employees, inventory, purchaseOrders] = await Promise.all([
          db.getOrders(),
          db.getInvoices(),
          db.getCustomers(),
          db.getVendors(),
          db.getEmployees(),
          db.getInventory(),
          db.getPurchaseOrders(),
        ]);

        // Calculate metrics
        const totalRevenue = invoices
          .filter((inv: any) => inv.status === 'paid')
          .reduce((sum: number, inv: any) => sum + parseFloat(inv.totalAmount || '0'), 0);

        const totalOrders = orders.length;
        const customerCount = customers.length;
        const vendorCount = vendors.length;
        const employeeCount = employees.filter((e: any) => e.status === 'active').length;
        const recentHires = employees
          .filter((e: any) => {
            if (!e.createdAt) return false;
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            return new Date(e.createdAt) > threeMonthsAgo;
          })
          .map((e: any) => e.name || 'New Hire');

        const inventoryValue = inventory.reduce((sum: number, item: any) => {
          const qty = parseFloat(item.quantity || '0');
          const cost = parseFloat(item.unitCost || '0');
          return sum + (qty * cost);
        }, 0);

        const activePOs = purchaseOrders.filter((po: any) => po.status === 'approved' || po.status === 'sent').length;

        const prompt = `Generate a professional quarterly investor update for ${companyName}.

Data:
- Period: ${period}
- Revenue this quarter: $${totalRevenue.toLocaleString()}
- Total orders: ${totalOrders}
- Customers: ${customerCount}
- Vendors: ${vendorCount}
- Team size: ${employeeCount} employees
- Key hires: ${recentHires.length > 0 ? recentHires.join(', ') : 'None this quarter'}
- Inventory value: $${inventoryValue.toLocaleString()}
- Active POs: ${activePOs}

Format as a clean markdown report with these sections:
1. TL;DR (3 bullet executive summary)
2. Financial Highlights (revenue, burn, runway)
3. Operations (supply chain, manufacturing, logistics)
4. Team (headcount, key hires)
5. Product & Milestones
6. Cap Table (if changes)
7. Asks (3 specific requests from investors — intros, advice, connections)
8. Next Quarter Outlook

Keep it professional, concise, and data-driven. Use actual numbers from the data provided.`;

        const result = await invokeLLM({
          messages: [
            { role: "system", content: "You are a CFO drafting a quarterly investor update. Be professional, concise, and transparent." },
            { role: "user", content: prompt },
          ],
        });

        const rawContent = result.choices?.[0]?.message?.content || "";
        const generatedContent = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

        return {
          content: generatedContent,
          period,
          title: `${companyName} — ${period} Investor Update`,
          highlights: JSON.stringify([
            `Revenue: $${totalRevenue.toLocaleString()}`,
            `Orders: ${totalOrders}`,
            `Team: ${employeeCount} employees`,
            `Inventory: $${inventoryValue.toLocaleString()}`,
          ]),
          asks: JSON.stringify([
            "Introductions to potential retail partners",
            "Feedback on product roadmap priorities",
            "Connections to supply chain optimization consultants",
          ]),
          callsToAction: JSON.stringify([
            "Schedule a 1:1 call with the CEO",
            "Review the updated financial model",
            "Share any relevant industry contacts",
          ]),
        };
      }),
  }),
});

function getCurrentQuarter(): string {
  const now = new Date();
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${quarter} ${now.getFullYear()}`;
}
