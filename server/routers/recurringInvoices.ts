// appRouter.recurringInvoices — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { financeProcedure, createAuditLog, calculateNextGenerationDate } from "./_shared";

// ============================================
// RECURRING INVOICES
// ============================================
export const recurringInvoicesRouter = router({
    list: financeProcedure
      .input(z.object({
        customerId: z.number().optional(),
        isActive: z.boolean().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getRecurringInvoices(input);
      }),
    getById: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRecurringInvoiceWithItems(input.id);
      }),
    create: financeProcedure
      .input(z.object({
        customerId: z.number(),
        templateName: z.string(),
        description: z.string().optional(),
        frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'annually']),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(31).optional(),
        startDate: z.date(),
        endDate: z.date().optional(),
        currency: z.string().default('USD'),
        autoSend: z.boolean().default(false),
        daysUntilDue: z.number().default(30),
        notes: z.string().optional(),
        terms: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().optional(),
          description: z.string(),
          quantity: z.string(),
          unitPrice: z.string(),
          taxRate: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { items, ...invoiceData } = input;
        
        // Calculate totals
        let subtotal = 0;
        let taxAmount = 0;
        const processedItems = items.map(item => {
          const qty = parseFloat(item.quantity) || 0;
          const price = parseFloat(item.unitPrice) || 0;
          const lineTotal = qty * price;
          const lineTax = item.taxRate ? lineTotal * (parseFloat(item.taxRate) / 100) : 0;
          subtotal += lineTotal;
          taxAmount += lineTax;
          return { ...item, totalAmount: (lineTotal + lineTax).toString(), taxAmount: lineTax.toString() };
        });
        
        const totalAmount = subtotal + taxAmount;
        
        // Calculate next generation date
        const nextGenerationDate = new Date(input.startDate);
        
        const result = await db.createRecurringInvoice({
          ...invoiceData,
          subtotal: subtotal.toString(),
          taxAmount: taxAmount.toString(),
          totalAmount: totalAmount.toString(),
          nextGenerationDate,
          createdBy: ctx.user.id,
        });
        
        // Create line items
        for (const item of processedItems) {
          await db.createRecurringInvoiceItem({
            recurringInvoiceId: result.id,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
          });
        }
        
        await createAuditLog(ctx.user.id, 'create', 'recurring_invoice', result.id, input.templateName);
        return result;
      }),
    update: financeProcedure
      .input(z.object({
        id: z.number(),
        templateName: z.string().optional(),
        description: z.string().optional(),
        frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'annually']).optional(),
        dayOfWeek: z.number().min(0).max(6).optional(),
        dayOfMonth: z.number().min(1).max(31).optional(),
        endDate: z.date().optional(),
        autoSend: z.boolean().optional(),
        daysUntilDue: z.number().optional(),
        notes: z.string().optional(),
        terms: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateRecurringInvoice(id, data);
        await createAuditLog(ctx.user.id, 'update', 'recurring_invoice', id);
        return { success: true };
      }),
    generateNow: financeProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const recurring = await db.getRecurringInvoiceWithItems(input.id);
        if (!recurring) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recurring invoice not found' });
        
        // Generate invoice number
        const invoiceNumber = `INV-${Date.now()}`;
        const issueDate = new Date();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (recurring.daysUntilDue || 30));
        
        // Create the invoice
        const invoiceResult = await db.createInvoice({
          companyId: recurring.companyId,
          customerId: recurring.customerId,
          invoiceNumber,
          type: 'invoice',
          status: 'draft',
          issueDate,
          dueDate,
          subtotal: recurring.subtotal,
          taxAmount: recurring.taxAmount,
          discountAmount: recurring.discountAmount,
          totalAmount: recurring.totalAmount,
          currency: recurring.currency,
          notes: recurring.notes,
          terms: recurring.terms,
          createdBy: ctx.user.id,
        });
        
        // Create invoice items
        for (const item of recurring.items || []) {
          await db.createInvoiceItem({
            invoiceId: invoiceResult.id,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
          });
        }
        
        // Update recurring invoice
        const nextDate = calculateNextGenerationDate(recurring.frequency, recurring.dayOfWeek, recurring.dayOfMonth);
        await db.updateRecurringInvoice(input.id, {
          lastGeneratedAt: new Date(),
          nextGenerationDate: nextDate,
          generationCount: (recurring.generationCount || 0) + 1,
        });
        
        // Record history
        await db.createRecurringInvoiceHistory({
          recurringInvoiceId: input.id,
          generatedInvoiceId: invoiceResult.id,
          scheduledFor: issueDate,
          status: 'generated',
        });
        
        await createAuditLog(ctx.user.id, 'create', 'invoice', invoiceResult.id, `Generated from recurring: ${recurring.templateName}`);
        
        return { invoiceId: invoiceResult.id, invoiceNumber };
      }),
    history: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRecurringInvoiceHistory(input.id);
      }),
    toggleActive: financeProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateRecurringInvoice(input.id, { isActive: input.isActive });
        await createAuditLog(ctx.user.id, 'update', 'recurring_invoice', input.id, input.isActive ? 'Activated' : 'Paused');
        return { success: true };
      }),
  });
