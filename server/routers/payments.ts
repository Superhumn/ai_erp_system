// appRouter.payments — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { financeProcedure, resolveRequestScope, assertNonEmptyScope, createAuditLog, generateNumber } from "./_shared";

// ============================================
// FINANCE - PAYMENTS
// ============================================
export const paymentsRouter = router({
    list: financeProcedure
      .input(z.object({
        type: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ input, ctx }) =>
        db.getPayments(assertNonEmptyScope(await resolveRequestScope(ctx.user)), { type: input?.type, status: input?.status }),
      ),
    get: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getPaymentById(input.id)),
    create: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.enum(['received', 'made']),
        invoiceId: z.number().optional(),
        vendorId: z.number().optional(),
        customerId: z.number().optional(),
        accountId: z.number().optional(),
        amount: z.string(),
        currency: z.string().optional(),
        paymentMethod: z.enum(['cash', 'check', 'bank_transfer', 'credit_card', 'ach', 'wire', 'other']).optional(),
        paymentDate: z.date(),
        referenceNumber: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const paymentNumber = generateNumber('PAY');
        const result = await db.createPayment({ ...input, paymentNumber, createdBy: ctx.user.id });
        
        // Update invoice paid amount if linked
        if (input.invoiceId) {
          const invoice = await db.getInvoiceById(input.invoiceId);
          if (invoice) {
            const newPaidAmount = (parseFloat(invoice.paidAmount || '0') + parseFloat(input.amount)).toString();
            const newStatus = parseFloat(newPaidAmount) >= parseFloat(invoice.totalAmount) ? 'paid' : 'partial';
            await db.updateInvoice(input.invoiceId, { paidAmount: newPaidAmount, status: newStatus });

            // ── Cascade #16b: Invoice fully paid → mark linked order as "delivered" ──
            if (newStatus === "paid") {
              try {
                const allOrders = await db.getOrders();
                const linkedOrder = allOrders.find((o: any) => o.invoiceId === input.invoiceId);
                if (linkedOrder && linkedOrder.status !== "delivered" && linkedOrder.status !== "cancelled") {
                  await db.updateOrder(linkedOrder.id, { status: "delivered" });
                  console.log(`[Cascade] Invoice ${input.invoiceId} paid → Order ${linkedOrder.id} marked as delivered`);
                }
              } catch (e) {
                console.warn("[Cascade] Invoice paid→Order complete failed:", e);
              }
            }
          }
        }

        await createAuditLog(ctx.user.id, 'create', 'payment', result.id, paymentNumber);
        return result;
      }),
    update: financeProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'completed', 'failed', 'cancelled']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updatePayment(id, data);
        await createAuditLog(ctx.user.id, 'update', 'payment', id);
        return { success: true };
      }),

    createFromText: financeProcedure
      .input(z.object({ text: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const parsed = await invokeLLM({
          messages: [
            { role: 'system', content: 'Extract payment details from the text and return a JSON object with: amount (string), type ("received" or "made"), notes (string). Return only valid JSON.' },
            { role: 'user', content: input.text },
          ],
        });
        let paymentData: any = {};
        try {
          const rawContent = parsed.choices[0]?.message?.content;
          const raw = typeof rawContent === 'string' ? rawContent : '{}';
          paymentData = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        } catch { paymentData = {}; }
        const amount = paymentData.amount || '0';
        const paymentNumber = generateNumber('PAY');
        const result = await db.createPayment({
          type: paymentData.type || 'received',
          amount,
          paymentNumber,
          paymentDate: new Date(),
          notes: paymentData.notes || input.text,
          createdBy: ctx.user.id,
        });
        await createAuditLog(ctx.user.id, 'create', 'payment', result.id, paymentNumber);
        return { amount, id: result.id, paymentNumber };
      }),
  });
