// appRouter.invoices — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import * as emailService from "../_core/emailService";
import { parseInvoiceText } from "../_core/invoiceTextParser";
import * as db from "../db";
import { financeProcedure, resolveRequestScope, assertNonEmptyScope, createAuditLog, generateNumber } from "./_shared";

// ============================================
// FINANCE - INVOICES
// ============================================
export const invoicesRouter = router({
    // financeProcedure keeps the role gate; scope is resolved server-side. companyId is not client input.
    list: financeProcedure
      .input(z.object({
        status: z.string().optional(),
        customerId: z.number().optional(),
      }).optional())
      .query(async ({ input, ctx }) =>
        db.getInvoices(assertNonEmptyScope(await resolveRequestScope(ctx.user)), { status: input?.status, customerId: input?.customerId }),
      ),
    get: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getInvoiceWithItems(input.id)),
    create: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        customerId: z.number().optional(),
        type: z.enum(['invoice', 'credit_note', 'quote']).optional(),
        issueDate: z.date(),
        dueDate: z.date().optional(),
        subtotal: z.string(),
        taxAmount: z.string().optional(),
        discountAmount: z.string().optional(),
        totalAmount: z.string(),
        currency: z.string().optional(),
        notes: z.string().optional(),
        terms: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().optional(),
          description: z.string(),
          quantity: z.string(),
          unitPrice: z.string(),
          taxRate: z.string().optional(),
          taxAmount: z.string().optional(),
          totalAmount: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { items, ...invoiceData } = input;
        const invoiceNumber = generateNumber('INV');
        const result = await db.createInvoice({ ...invoiceData, invoiceNumber, createdBy: ctx.user.id });
        
        if (items && items.length > 0) {
          for (const item of items) {
            await db.createInvoiceItem({ ...item, invoiceId: result.id });
          }
        }
        
        await createAuditLog(ctx.user.id, 'create', 'invoice', result.id, invoiceNumber);

        // Auto-create journal entry for invoice (double-entry bookkeeping)
        try {
          const txn = await db.createTransaction({
            companyId: input.companyId || 1,
            transactionNumber: `JE-INV-${invoiceNumber}`,
            type: "invoice",
            referenceType: "invoice",
            referenceId: result.id,
            date: new Date(),
            description: `Journal entry for Invoice ${invoiceNumber}`,
            totalAmount: input.totalAmount,
            status: "posted",
            createdBy: ctx.user.id,
            postedBy: ctx.user.id,
            postedAt: new Date(),
          });

          // Debit: Accounts Receivable, Credit: Revenue
          const arAccount = await db.getAccountByCode("1200", input.companyId)
            || await db.getAccountByName("Accounts Receivable", input.companyId);
          const revenueAccount = await db.getAccountByCode("4000", input.companyId)
            || await db.getAccountByName("Revenue", input.companyId);

          if (arAccount) {
            await db.createTransactionLine({
              transactionId: txn.id,
              accountId: arAccount.id,
              debit: input.totalAmount,
              credit: "0",
              description: `AR - Invoice ${invoiceNumber}`,
            });
          }
          if (revenueAccount) {
            await db.createTransactionLine({
              transactionId: txn.id,
              accountId: revenueAccount.id,
              debit: "0",
              credit: input.totalAmount,
              description: `Revenue - Invoice ${invoiceNumber}`,
            });
          }
        } catch (e) {
          console.warn("[Journal Entry] Failed to auto-create for invoice:", e);
        }

        return result;
      }),
    update: financeProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled']).optional(),
        dueDate: z.date().optional(),
        paidAmount: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const oldInvoice = await db.getInvoiceById(id);
        await db.updateInvoice(id, data);
        await createAuditLog(ctx.user.id, 'update', 'invoice', id, oldInvoice?.invoiceNumber, oldInvoice, data);

        // ── Cascade #16b: Invoice status changed to "paid" → mark linked order as "delivered" ──
        if (input.status === "paid" && oldInvoice?.status !== "paid") {
          try {
            const allOrders = await db.getOrders();
            const linkedOrder = allOrders.find((o: any) => o.invoiceId === id);
            if (linkedOrder && linkedOrder.status !== "delivered" && linkedOrder.status !== "cancelled") {
              await db.updateOrder(linkedOrder.id, { status: "delivered" });
              console.log(`[Cascade] Invoice ${id} paid → Order ${linkedOrder.id} marked as delivered`);
            }
          } catch (e) {
            console.warn("[Cascade] Invoice paid→Order complete failed:", e);
          }
        }

        return { success: true };
      }),
    approve: financeProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateInvoice(input.id, { status: 'sent', approvedBy: ctx.user.id, approvedAt: new Date() });
        await createAuditLog(ctx.user.id, 'approve', 'invoice', input.id);
        return { success: true };
      }),
    sendEmail: financeProcedure
      .input(z.object({
        invoiceId: z.number(),
        message: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const invoice = await db.getInvoiceWithItems(input.invoiceId);
        if (!invoice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
        
        const customer = invoice.customer;
        if (!customer?.email) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Customer has no email address' });
        }
        
        // Format line items for email
        const itemsHtml = invoice.items?.map((item: any) => 
          `<tr><td>${item.description}</td><td>${item.quantity}</td><td>$${Number(item.unitPrice).toFixed(2)}</td><td>$${Number(item.totalAmount).toFixed(2)}</td></tr>`
        ).join('') || '';
        
        const emailContent = `
          <h2>Invoice ${invoice.invoiceNumber}</h2>
          <p>Dear ${customer.name},</p>
          ${input.message ? `<p>${input.message}</p>` : ''}
          <p>Please find your invoice details below:</p>
          <table border="1" cellpadding="8" style="border-collapse: collapse;">
            <tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
            ${itemsHtml}
          </table>
          <p><strong>Subtotal:</strong> $${Number(invoice.subtotal).toFixed(2)}</p>
          <p><strong>Tax:</strong> $${Number(invoice.taxAmount || 0).toFixed(2)}</p>
          <p><strong>Total Due:</strong> $${Number(invoice.totalAmount).toFixed(2)}</p>
          <p><strong>Due Date:</strong> ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}</p>
          ${invoice.notes ? `<p><strong>Notes:</strong> ${invoice.notes}</p>` : ''}
          <p>Thank you for your business!</p>
        `;
        
        const { sendEmail } = await import('../_core/email');
        await sendEmail({
          to: customer.email,
          subject: `Invoice ${invoice.invoiceNumber} from SuperHumn`,
          html: emailContent,
        });
        
        // Update invoice status to sent
        await db.updateInvoice(input.invoiceId, { status: 'sent' });
        await createAuditLog(ctx.user.id, 'update', 'invoice', input.invoiceId, invoice.invoiceNumber);
        
        return { success: true };
      }),
    generatePdf: financeProcedure
      .input(z.object({ invoiceId: z.number() }))
      .mutation(async ({ input }) => {
        const invoice = await db.getInvoiceWithItems(input.invoiceId);
        if (!invoice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
        
        const { generateInvoicePdf, getDefaultCompanyInfo } = await import('../_core/invoicePdf');
        const company = getDefaultCompanyInfo();
        
        const pdfBuffer = await generateInvoicePdf({
          invoiceNumber: invoice.invoiceNumber,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          customer: {
            name: invoice.customer?.name || 'Customer',
            email: invoice.customer?.email,
          },
          items: invoice.items.map((item: any) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
          })),
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount,
          discountAmount: invoice.discountAmount,
          totalAmount: invoice.totalAmount,
          notes: invoice.notes,
          terms: invoice.terms,
          currency: invoice.currency || 'USD',
        }, company);
        
        // Return base64 encoded PDF
        return { 
          pdf: pdfBuffer.toString('base64'),
          filename: `invoice-${invoice.invoiceNumber}.pdf`,
        };
      }),
    recordPayment: financeProcedure
      .input(z.object({
        invoiceId: z.number(),
        amount: z.string(),
        paymentMethod: z.enum(['cash', 'check', 'bank_transfer', 'credit_card', 'other']).default('bank_transfer'),
        reference: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const invoice = await db.getInvoiceById(input.invoiceId);
        if (!invoice) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
        
        // Create payment record
        const paymentResult = await db.createPayment({
          companyId: invoice.companyId,
          type: 'received',
          status: 'completed',
          amount: input.amount,
          currency: invoice.currency || 'USD',
          paymentMethod: input.paymentMethod,
          paymentNumber: `PAY-${Date.now()}`,
          paymentDate: new Date(),
          invoiceId: input.invoiceId,
          notes: input.notes || `Payment received for invoice ${invoice.invoiceNumber}`,
        });
        
        // Update invoice paid amount and status
        const currentPaid = parseFloat(invoice.paidAmount || '0');
        const newPayment = parseFloat(input.amount);
        const totalPaid = currentPaid + newPayment;
        const totalDue = parseFloat(invoice.totalAmount);
        
        const newStatus = totalPaid >= totalDue ? 'paid' : 'partial';
        await db.updateInvoice(input.invoiceId, {
          paidAmount: totalPaid.toString(),
          status: newStatus,
        });

        await createAuditLog(ctx.user.id, 'update', 'invoice', input.invoiceId, `Payment recorded: ${input.amount}`);

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

        // Auto-create journal entry for payment (double-entry bookkeeping)
        try {
          const paymentNumber = `PAY-${paymentResult.id}`;
          const txn = await db.createTransaction({
            companyId: invoice.companyId || 1,
            transactionNumber: `JE-PAY-${paymentNumber}`,
            type: "payment",
            referenceType: "payment",
            referenceId: paymentResult.id,
            date: new Date(),
            description: `Journal entry for payment on Invoice ${invoice.invoiceNumber}`,
            totalAmount: input.amount,
            status: "posted",
            createdBy: ctx.user.id,
            postedBy: ctx.user.id,
            postedAt: new Date(),
          });

          // Debit: Cash/Bank, Credit: Accounts Receivable
          const cashAccount = await db.getAccountByCode("1000", invoice.companyId ?? undefined)
            || await db.getAccountByName("Cash", invoice.companyId ?? undefined);
          const arAccount = await db.getAccountByCode("1200", invoice.companyId ?? undefined)
            || await db.getAccountByName("Accounts Receivable", invoice.companyId ?? undefined);

          if (cashAccount) {
            await db.createTransactionLine({
              transactionId: txn.id,
              accountId: cashAccount.id,
              debit: input.amount,
              credit: "0",
              description: `Cash received - Invoice ${invoice.invoiceNumber}`,
            });
          }
          if (arAccount) {
            await db.createTransactionLine({
              transactionId: txn.id,
              accountId: arAccount.id,
              debit: "0",
              credit: input.amount,
              description: `AR reduced - Invoice ${invoice.invoiceNumber}`,
            });
          }
        } catch (e) {
          console.warn("[Journal Entry] Failed to auto-create for payment:", e);
        }

        return {
          success: true,
          paymentId: paymentResult.id,
          newStatus,
          totalPaid: totalPaid.toString(),
        };
      }),
    createFromText: financeProcedure
      .input(z.object({ text: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const parsed = await parseInvoiceText(input.text);

        let customer = await db.getCustomerByName(parsed.customerName);
        if (!customer) {
          const created = await db.createCustomer({
            name: parsed.customerName,
            type: "business",
            status: "active",
          });
          customer = await db.getCustomerById(created.id);
        }
        if (!customer) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to resolve customer" });
        }

        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
        const issueDate = new Date();
        const dueDate = parsed.dueInDays
          ? new Date(issueDate.getTime() + parsed.dueInDays * 24 * 60 * 60 * 1000)
          : null;

        const total = parsed.amount.toFixed(2);
        const created = await db.createInvoice({
          invoiceNumber,
          customerId: customer.id,
          type: "invoice",
          status: "draft",
          issueDate,
          dueDate: dueDate ?? undefined,
          subtotal: total,
          totalAmount: total,
          terms: parsed.paymentTerms,
          createdBy: ctx.user.id,
        });

        await db.createInvoiceItem({
          invoiceId: created.id,
          description: parsed.quantity && parsed.unit
            ? `${parsed.description} (${parsed.quantity} ${parsed.unit})`
            : parsed.description,
          quantity: (parsed.quantity ?? 1).toString(),
          unitPrice: (parsed.amount / (parsed.quantity ?? 1)).toFixed(2),
          totalAmount: total,
        });

        await createAuditLog(ctx.user.id, 'create', 'invoice', created.id, invoiceNumber);

        return { id: created.id, invoiceNumber, parsed, invoiceId: created.id };
      }),
    approveAndEmail: financeProcedure
      .input(z.object({ invoiceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const invoice = await db.getInvoiceById(input.invoiceId);
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
        }

        await db.updateInvoice(input.invoiceId, {
          status: "sent",
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
        });

        const emailResult = await emailService.sendInvoiceEmail(input.invoiceId, {
          triggeredBy: ctx.user.id,
        });

        await createAuditLog(ctx.user.id, 'approve', 'invoice', input.invoiceId, invoice.invoiceNumber);

        return {
          success: true,
          invoiceNumber: invoice.invoiceNumber,
          emailQueued: emailResult.success,
          emailError: emailResult.success ? undefined : emailResult.error,
        };
      }),
    delete: financeProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteInvoice(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'invoice', input.id);
        return { success: true };
      }),
  });
