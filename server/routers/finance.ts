import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendEmail } from "../_core/email";
import { addCostLayer, recordCogs, getInventoryValuation, generateCogsPeriodSummary } from "../inventoryCostingService";
import * as db from "../db";
import { router, protectedProcedure, financeProcedure, opsProcedure, createAuditLog, generateNumber } from "./middleware";

export const financeRouter = router({
  // ============================================
  // FINANCE - ACCOUNTS
  // ============================================
  accounts: router({
    list: financeProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getAccounts(input?.companyId)),
    get: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getAccountById(input.id)),
    create: financeProcedure
      .input(z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
        companyId: z.number().optional(),
        subtype: z.string().optional(),
        description: z.string().optional(),
        currency: z.string().optional(),
        parentAccountId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createAccount(input);
        await createAuditLog(ctx.user.id, 'create', 'account', result.id, input.name);
        return result;
      }),
    update: financeProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateAccount(id, data);
        await createAuditLog(ctx.user.id, 'update', 'account', id);
        return { success: true };
      }),
  }),
  // ============================================
  // FINANCE - INVOICES
  // ============================================
  invoices: router({
    list: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        customerId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getInvoices(input)),
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
        
        return { 
          success: true, 
          paymentId: paymentResult.id,
          newStatus,
          totalPaid: totalPaid.toString(),
        };
      }),
  }),
  // ============================================
  // FINANCE - PAYMENTS
  // ============================================
  payments: router({
    list: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getPayments(input)),
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
  }),
  // ============================================
  // FINANCE - TRANSACTIONS
  // ============================================
  transactions: router({
    list: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getTransactions(input)),
    create: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.enum(['journal', 'invoice', 'payment', 'expense', 'transfer', 'adjustment']),
        date: z.date(),
        description: z.string().optional(),
        totalAmount: z.string(),
        currency: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const transactionNumber = generateNumber('TXN');
        const result = await db.createTransaction({ ...input, transactionNumber, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'transaction', result.id, transactionNumber);
        return result;
      }),
  }),
  // ============================================
  // COGS & PROFITABILITY TRACKING
  // ============================================
  cogs: router({
    // Record COGS when a sale is fulfilled
    recordSale: opsProcedure
      .input(z.object({
        salesOrderId: z.number(),
        salesOrderLineId: z.number(),
        productId: z.number(),
        warehouseId: z.number(),
        quantitySold: z.number(),
        revenueAmount: z.number(),
        freightCostAllocated: z.number().optional(),
        customsCostAllocated: z.number().optional(),
        insuranceCostAllocated: z.number().optional(),
        otherCostAllocated: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.recordCOGSSale(
          input.salesOrderId,
          input.salesOrderLineId,
          input.productId,
          input.warehouseId,
          input.quantitySold,
          input.revenueAmount,
          input.freightCostAllocated,
          input.customsCostAllocated,
          input.insuranceCostAllocated,
          input.otherCostAllocated
        );
        await createAuditLog(ctx.user.id, 'create', 'cogs_transaction', input.salesOrderLineId, `Recorded COGS for sale`);
        return result;
      }),

    // Get COGS transaction history
    getTransactions: opsProcedure
      .input(z.object({
        salesOrderId: z.number().optional(),
        productId: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(1000).optional(),
      }).optional())
      .query(({ input }) => db.getCOGSTransactions(input, input?.limit)),

    // Get product profitability report
    profitability: opsProcedure
      .input(z.object({
        productId: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }).optional())
      .query(({ input }) => db.getProductProfitability(input?.productId, input?.startDate, input?.endDate)),

    // Get inventory valuation
    valuation: opsProcedure
      .input(z.object({
        warehouseId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getInventoryValuation(input?.warehouseId)),

    // Allocate freight costs to products
    allocateFreight: opsProcedure
      .input(z.object({
        purchaseOrderId: z.number().optional(),
        shipmentId: z.number().optional(),
        totalFreightCost: z.number(),
        totalCustomsDuties: z.number().optional(),
        totalInsuranceCost: z.number().optional(),
        totalHandlingFees: z.number().optional(),
        allocationMethod: z.enum(['weight', 'volume', 'quantity', 'value', 'manual']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.allocateFreightCosts(
          input.purchaseOrderId || null,
          input.shipmentId || null,
          input.totalFreightCost,
          input.totalCustomsDuties,
          input.totalInsuranceCost,
          input.totalHandlingFees,
          input.allocationMethod || 'quantity',
          ctx.user.id
        );
        await createAuditLog(ctx.user.id, 'create', 'freight_allocation', input.purchaseOrderId || input.shipmentId || 0, 'Allocated freight costs');
        return { success: true };
      }),

    // Update inventory cost basis (when receiving goods)
    updateCostBasis: opsProcedure
      .input(z.object({
        productId: z.number(),
        warehouseId: z.number(),
        receivedQuantity: z.number(),
        unitCost: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.updateInventoryCostBasis(
          input.productId,
          input.warehouseId,
          input.receivedQuantity,
          input.unitCost
        );
        await createAuditLog(ctx.user.id, 'update', 'inventory', input.productId, 'Updated inventory cost basis');
        return { success: true };
      }),
  }),
  // ============================================
  // INVENTORY RECONCILIATION
  // ============================================
  reconciliation: router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
        channel: z.enum(['shopify', 'amazon', 'all']).optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getReconciliationRuns(input);
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const run = await db.getReconciliationRunById(input.id);
        if (!run) return null;
        const lines = await db.getReconciliationLines(input.id);
        return { ...run, lines };
      }),
    run: protectedProcedure
      .input(z.object({
        channel: z.enum(['shopify', 'amazon', 'all']),
        storeId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.runInventoryReconciliation(input.channel, input.storeId, ctx.user?.id);
      }),
  }),
  // ============================================
  // INVENTORY ALLOCATIONS
  // ============================================
  allocations: router({
    list: protectedProcedure
      .input(z.object({
        channel: z.enum(['shopify', 'amazon', 'wholesale', 'retail']).optional(),
        productId: z.number().optional(),
        storeId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getInventoryAllocations(input);
      }),
    create: protectedProcedure
      .input(z.object({
        channel: z.enum(['shopify', 'amazon', 'wholesale', 'retail']),
        productId: z.number(),
        warehouseId: z.number(),
        storeId: z.number().optional(),
        allocatedQuantity: z.string(),
        reservedQuantity: z.string().default('0'),
      }))
      .mutation(async ({ input }) => {
        return db.createInventoryAllocation({
          ...input,
          remainingQuantity: input.allocatedQuantity,
        });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        allocatedQuantity: z.string().optional(),
        reservedQuantity: z.string().optional(),
        remainingQuantity: z.string().optional(),
        channelReportedQuantity: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateInventoryAllocation(id, data);
        return { success: true };
      }),
  }),
  // ============================================
  // RECURRING INVOICES
  // ============================================
  recurringInvoices: router({
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
  }),
  // ============================================
  // INVENTORY COSTING & COGS
  // ============================================
  inventoryCosting: router({
    // Costing config per product
    configs: router({
      list: opsProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getInventoryCostingConfigs(input)),
      getByProduct: opsProcedure
        .input(z.object({ productId: z.number() }))
        .query(({ input }) => db.getInventoryCostingConfigByProduct(input.productId)),
      create: opsProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number(),
          costingMethod: z.enum(["fifo", "lifo", "weighted_average"]),
          isActive: z.boolean().optional(),
          effectiveDate: z.date().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createInventoryCostingConfig({
            ...input,
            createdBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'create', 'inventoryCostingConfig', result.id);
          return result;
        }),
      update: opsProcedure
        .input(z.object({
          id: z.number(),
          costingMethod: z.enum(["fifo", "lifo", "weighted_average"]).optional(),
          isActive: z.boolean().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateInventoryCostingConfig(id, data);
          await createAuditLog(ctx.user.id, 'update', 'inventoryCostingConfig', id);
          return { success: true };
        }),
    }),

    // Cost layers
    layers: router({
      list: opsProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number().optional(),
          warehouseId: z.number().optional(),
          status: z.string().optional(),
        }).optional())
        .query(({ input }) => db.getInventoryCostLayers(input)),
      create: opsProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number(),
          warehouseId: z.number().optional(),
          purchaseOrderId: z.number().optional(),
          lotId: z.number().optional(),
          quantity: z.number().gt(0),
          unitCost: z.number().min(0),
          referenceType: z.string().optional(),
          referenceId: z.number().optional(),
          layerDate: z.date().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await addCostLayer({ ...input, createdBy: ctx.user.id });
          await createAuditLog(ctx.user.id, 'create', 'inventoryCostLayer', result.id);
          return result;
        }),
      getWeightedAverage: opsProcedure
        .input(z.object({ productId: z.number() }))
        .query(({ input }) => db.getWeightedAverageCost(input.productId)),
    }),

    // Valuation
    valuation: opsProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getInventoryValuation(input.productId)),

    // COGS
    cogs: router({
      list: financeProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number().optional(),
          orderId: z.number().optional(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        }).optional())
        .query(({ input }) => db.getCogsRecords(input)),
      record: opsProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number(),
          warehouseId: z.number().optional(),
          orderId: z.number().optional(),
          salesOrderLineId: z.number().optional(),
          quantitySold: z.number().gt(0),
          unitRevenue: z.number().min(0).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await recordCogs({ ...input, calculatedBy: ctx.user.id });
          await createAuditLog(ctx.user.id, 'create', 'cogsRecord', result.cogsRecordId);
          return result;
        }),
      summary: financeProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number().optional(),
          periodType: z.string().optional(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
        }).optional())
        .query(({ input }) => db.getCogsSummary(input)),
      generateSummary: financeProcedure
        .input(z.object({
          companyId: z.number().optional(),
          productId: z.number().optional(),
          periodType: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]),
          periodStart: z.date(),
          periodEnd: z.date(),
        }))
        .mutation(({ input }) => generateCogsPeriodSummary(input)),
      dashboard: financeProcedure
        .input(z.object({ companyId: z.number().optional() }).optional())
        .query(({ input }) => db.getCogsDashboardStats(input?.companyId)),
    }),
  }),
});

// Helper function to calculate next generation date for recurring invoices
function calculateNextGenerationDate(
  frequency: string,
  dayOfWeek?: number | null,
  dayOfMonth?: number | null
): Date {
  const now = new Date();
  const next = new Date(now);
  
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      if (dayOfWeek !== undefined && dayOfWeek !== null) {
        const currentDay = next.getDay();
        const daysUntil = (dayOfWeek - currentDay + 7) % 7;
        next.setDate(next.getDate() + daysUntil);
      }
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (dayOfMonth !== undefined && dayOfMonth !== null) {
        next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      }
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      if (dayOfMonth !== undefined && dayOfMonth !== null) {
        next.setDate(Math.min(dayOfMonth, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      }
      break;
    case 'annually':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  
  return next;
}
