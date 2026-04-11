import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendEmail } from "../_core/email";
import { addCostLayer, recordCogs, getInventoryValuation, generateCogsPeriodSummary } from "../inventoryCostingService";
import { invokeLLM } from "../_core/llm";
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
        const result = await db.recordCOGSSale(input as any);
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
      .query(({ input }) => db.getCOGSTransactions(input as any)),

    // Get product profitability report
    profitability: opsProcedure
      .input(z.object({
        productId: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }).optional())
      .query(({ input }) => db.getProductProfitability(input?.productId as any)),

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
        await db.allocateFreightCosts(input as any);
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
          { additionalCost: input.unitCost.toString(), reason: `Received ${input.receivedQuantity} units at warehouse ${input.warehouseId}` }
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

  // ============================================
  // FINANCIAL REPORTS
  // ============================================
  financialReports: router({
    generate: financeProcedure
      .input(z.object({
        reportType: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const start = input.startDate ? new Date(input.startDate) : new Date(new Date().getFullYear(), 0, 1);
        const end = input.endDate ? new Date(input.endDate) : new Date();

        const inRange = (d: Date | string | null | undefined): boolean => {
          if (!d) return false;
          const dt = typeof d === 'string' ? new Date(d) : d;
          return dt >= start && dt <= end;
        };

        const toNum = (v: any): number => {
          const n = Number(v);
          return isNaN(n) ? 0 : n;
        };

        switch (input.reportType) {
          // ---- Profit & Loss ----
          case "profit_loss": {
            const invoices = (await db.getInvoices({ status: 'paid' })).filter(i => inRange(i.issueDate));
            const totalRevenue = invoices.reduce((s, i) => s + toNum(i.totalAmount), 0);
            const cogsRecords = (await db.getCogsRecords()).filter((r: any) => inRange(r.soldAt || r.createdAt));
            const totalCOGS = cogsRecords.reduce((s: number, r: any) => s + toNum(r.totalCost), 0);
            const grossProfit = totalRevenue - totalCOGS;
            const transactions = (await db.getTransactions({ type: 'expense' })).filter(t => inRange(t.date));
            const expenseMap: Record<string, number> = {};
            for (const t of transactions) {
              const cat = (t as any).category || (t as any).accountName || 'Uncategorized';
              expenseMap[cat] = (expenseMap[cat] || 0) + toNum(t.totalAmount);
            }
            const totalExpenses = Object.values(expenseMap).reduce((a, b) => a + b, 0);
            const netIncome = grossProfit - totalExpenses;

            const rows: any[] = [
              { label: 'Total Revenue', amount: totalRevenue, type: 'header' },
              { label: 'Cost of Goods Sold', amount: totalCOGS, type: 'item' },
              { label: 'Gross Profit', amount: grossProfit, type: 'subtotal' },
              ...Object.entries(expenseMap).map(([cat, amt]) => ({ label: cat, amount: amt, type: 'item' })),
              { label: 'Total Operating Expenses', amount: totalExpenses, type: 'subtotal' },
              { label: 'Net Income', amount: netIncome, type: 'total' },
            ];
            return {
              title: 'Profit & Loss (Income Statement)',
              headers: ['Category', 'Amount'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `Revenue: $${totalRevenue.toFixed(2)} | COGS: $${totalCOGS.toFixed(2)} | Net Income: $${netIncome.toFixed(2)}`,
            };
          }

          // ---- Balance Sheet ----
          case "balance_sheet": {
            const payments = await db.getPayments();
            const cashIn = payments.filter(p => p.type === 'received' && p.status === 'completed').reduce((s, p) => s + toNum(p.amount), 0);
            const cashOut = payments.filter(p => p.type === 'made' && p.status === 'completed').reduce((s, p) => s + toNum(p.amount), 0);
            const cashBalance = cashIn - cashOut;

            const allInvoices = await db.getInvoices();
            const arBalance = allInvoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + toNum(i.totalAmount), 0);

            const inventory = await db.getInventory();
            const products = await db.getProducts();
            const productMap = new Map(products.map((p: any) => [p.id, p]));
            const inventoryValue = inventory.reduce((s, inv) => {
              const prod = productMap.get((inv as any).productId);
              return s + toNum(inv.quantity) * toNum(prod?.costPrice || 0);
            }, 0);

            const totalAssets = cashBalance + arBalance + inventoryValue;

            const purchaseOrders = await db.getPurchaseOrders({ status: 'received' });
            const apBalance = purchaseOrders.filter((po: any) => po.status !== 'paid').reduce((s: number, po: any) => s + toNum(po.totalAmount), 0);

            const totalLiabilities = apBalance;
            const equity = totalAssets - totalLiabilities;

            const rows: any[] = [
              { label: 'ASSETS', amount: null, type: 'header' },
              { label: 'Cash & Bank Balances', amount: cashBalance, type: 'item' },
              { label: 'Accounts Receivable', amount: arBalance, type: 'item' },
              { label: 'Inventory', amount: inventoryValue, type: 'item' },
              { label: 'Total Assets', amount: totalAssets, type: 'subtotal' },
              { label: 'LIABILITIES', amount: null, type: 'header' },
              { label: 'Accounts Payable', amount: apBalance, type: 'item' },
              { label: 'Total Liabilities', amount: totalLiabilities, type: 'subtotal' },
              { label: 'EQUITY', amount: null, type: 'header' },
              { label: 'Retained Earnings', amount: equity, type: 'item' },
              { label: 'Total Equity', amount: equity, type: 'subtotal' },
            ];
            return {
              title: 'Balance Sheet',
              headers: ['Account', 'Amount'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `Assets: $${totalAssets.toFixed(2)} | Liabilities: $${totalLiabilities.toFixed(2)} | Equity: $${equity.toFixed(2)}`,
            };
          }

          // ---- Cash Flow ----
          case "cash_flow": {
            const payments = (await db.getPayments()).filter(p => inRange(p.paymentDate) && p.status === 'completed');
            const operatingIn = payments.filter(p => p.type === 'received').reduce((s, p) => s + toNum(p.amount), 0);
            const operatingOut = payments.filter(p => p.type === 'made').reduce((s, p) => s + toNum(p.amount), 0);
            const operatingNet = operatingIn - operatingOut;

            const rows: any[] = [
              { label: 'OPERATING ACTIVITIES', amount: null, type: 'header' },
              { label: 'Cash Received from Customers', amount: operatingIn, type: 'item' },
              { label: 'Cash Paid to Suppliers & Employees', amount: -operatingOut, type: 'item' },
              { label: 'Net Cash from Operations', amount: operatingNet, type: 'subtotal' },
              { label: 'INVESTING ACTIVITIES', amount: null, type: 'header' },
              { label: 'Equipment & Capital Purchases', amount: 0, type: 'item' },
              { label: 'Net Cash from Investing', amount: 0, type: 'subtotal' },
              { label: 'FINANCING ACTIVITIES', amount: null, type: 'header' },
              { label: 'Equity / Debt Raised', amount: 0, type: 'item' },
              { label: 'Net Cash from Financing', amount: 0, type: 'subtotal' },
              { label: 'Net Change in Cash', amount: operatingNet, type: 'total' },
            ];
            return {
              title: 'Cash Flow Statement',
              headers: ['Category', 'Amount'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `Operating: $${operatingNet.toFixed(2)} | Investing: $0 | Financing: $0 | Net: $${operatingNet.toFixed(2)}`,
            };
          }

          // ---- Runway & Burn Rate ----
          case "runway": {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const recentPayments = (await db.getPayments()).filter(p => {
              const d = p.paymentDate ? new Date(p.paymentDate) : null;
              return d && d >= sixMonthsAgo && p.type === 'made' && p.status === 'completed';
            });
            const totalExpenses6m = recentPayments.reduce((s, p) => s + toNum(p.amount), 0);
            const monthlyBurn = totalExpenses6m / 6;

            const allPayments = await db.getPayments();
            const totalCashIn = allPayments.filter(p => p.type === 'received' && p.status === 'completed').reduce((s, p) => s + toNum(p.amount), 0);
            const totalCashOut = allPayments.filter(p => p.type === 'made' && p.status === 'completed').reduce((s, p) => s + toNum(p.amount), 0);
            const cashOnHand = totalCashIn - totalCashOut;
            const runwayMonths = monthlyBurn > 0 ? cashOnHand / monthlyBurn : Infinity;

            const rows: any[] = [
              { label: 'Cash on Hand', amount: cashOnHand, type: 'item' },
              { label: 'Monthly Burn Rate (6-mo avg)', amount: monthlyBurn, type: 'item' },
              { label: 'Runway (months)', amount: runwayMonths === Infinity ? 'N/A (no burn)' : runwayMonths.toFixed(1), type: 'total' },
            ];
            return {
              title: 'Runway & Burn Rate',
              headers: ['Metric', 'Value'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `Cash: $${cashOnHand.toFixed(2)} | Burn: $${monthlyBurn.toFixed(2)}/mo | Runway: ${runwayMonths === Infinity ? 'N/A' : runwayMonths.toFixed(1)} months`,
            };
          }

          // ---- Revenue by Customer ----
          case "revenue_by_customer": {
            const invoices = (await db.getInvoices({ status: 'paid' })).filter(i => inRange(i.issueDate));
            const customers = await db.getCustomers();
            const custMap = new Map(customers.map((c: any) => [c.id, c.name || c.email || `Customer ${c.id}`]));
            const revenueMap: Record<string, number> = {};
            for (const inv of invoices) {
              const name = custMap.get((inv as any).customerId) || 'Unknown';
              revenueMap[name] = (revenueMap[name] || 0) + toNum(inv.totalAmount);
            }
            const sorted = Object.entries(revenueMap).sort((a, b) => b[1] - a[1]);
            const total = sorted.reduce((s, [, v]) => s + v, 0);
            const rows = sorted.map(([name, amount]) => ({
              label: name, amount, type: 'item', pct: total > 0 ? ((amount / total) * 100).toFixed(1) + '%' : '0%',
            }));
            rows.push({ label: 'Total', amount: total, type: 'total', pct: '100%' });
            return {
              title: 'Revenue by Customer',
              headers: ['Customer', 'Revenue', '% of Total'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `${sorted.length} customers | Total: $${total.toFixed(2)}`,
            };
          }

          // ---- Revenue by Product ----
          case "revenue_by_product": {
            const orders = (await db.getOrders()).filter(o => inRange(o.orderDate));
            const products = await db.getProducts();
            const prodMap = new Map(products.map((p: any) => [p.id, p.name || p.sku || `Product ${p.id}`]));
            const revenueMap: Record<string, number> = {};
            for (const order of orders) {
              try {
                const items = await db.getOrderItems(order.id);
                for (const item of items) {
                  const name = prodMap.get((item as any).productId) || 'Unknown Product';
                  revenueMap[name] = (revenueMap[name] || 0) + toNum((item as any).totalAmount);
                }
              } catch { /* skip */ }
            }
            const sorted = Object.entries(revenueMap).sort((a, b) => b[1] - a[1]);
            const total = sorted.reduce((s, [, v]) => s + v, 0);
            const rows = sorted.map(([name, amount]) => ({
              label: name, amount, type: 'item', pct: total > 0 ? ((amount / total) * 100).toFixed(1) + '%' : '0%',
            }));
            rows.push({ label: 'Total', amount: total, type: 'total', pct: '100%' });
            return {
              title: 'Revenue by Product',
              headers: ['Product', 'Revenue', '% of Total'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `${sorted.length} products | Total: $${total.toFixed(2)}`,
            };
          }

          // ---- Expenses by Category ----
          case "expense_by_category": {
            const transactions = (await db.getTransactions({ type: 'expense' })).filter(t => inRange(t.date));
            const expenseMap: Record<string, number> = {};
            for (const t of transactions) {
              const cat = (t as any).category || (t as any).accountName || 'Uncategorized';
              expenseMap[cat] = (expenseMap[cat] || 0) + toNum(t.totalAmount);
            }
            const sorted = Object.entries(expenseMap).sort((a, b) => b[1] - a[1]);
            const total = sorted.reduce((s, [, v]) => s + v, 0);
            const rows = sorted.map(([name, amount]) => ({
              label: name, amount, type: 'item', pct: total > 0 ? ((amount / total) * 100).toFixed(1) + '%' : '0%',
            }));
            rows.push({ label: 'Total Expenses', amount: total, type: 'total', pct: '100%' });
            return {
              title: 'Expenses by Category',
              headers: ['Category', 'Amount', '% of Total'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `${sorted.length} categories | Total: $${total.toFixed(2)}`,
            };
          }

          // ---- Expenses by Vendor ----
          case "expense_by_vendor": {
            const purchaseOrders = (await db.getPurchaseOrders()).filter((po: any) => inRange(po.orderDate || po.createdAt));
            const vendors = await db.getVendors();
            const vendMap = new Map(vendors.map((v: any) => [v.id, v.name || `Vendor ${v.id}`]));
            const spendMap: Record<string, number> = {};
            for (const po of purchaseOrders) {
              const name = vendMap.get((po as any).vendorId) || 'Unknown Vendor';
              spendMap[name] = (spendMap[name] || 0) + toNum((po as any).totalAmount);
            }
            const sorted = Object.entries(spendMap).sort((a, b) => b[1] - a[1]);
            const total = sorted.reduce((s, [, v]) => s + v, 0);
            const rows = sorted.map(([name, amount]) => ({
              label: name, amount, type: 'item', pct: total > 0 ? ((amount / total) * 100).toFixed(1) + '%' : '0%',
            }));
            rows.push({ label: 'Total', amount: total, type: 'total', pct: '100%' });
            return {
              title: 'Expenses by Vendor',
              headers: ['Vendor', 'Amount', '% of Total'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `${sorted.length} vendors | Total: $${total.toFixed(2)}`,
            };
          }

          // ---- Accounts Receivable Aging ----
          case "accounts_receivable": {
            const now = new Date();
            const unpaidInvoices = (await db.getInvoices()).filter(i => i.status !== 'paid' && i.status !== 'cancelled');
            const buckets: Record<string, { count: number; amount: number }> = {
              'Current': { count: 0, amount: 0 },
              '1-30 days': { count: 0, amount: 0 },
              '31-60 days': { count: 0, amount: 0 },
              '61-90 days': { count: 0, amount: 0 },
              '90+ days': { count: 0, amount: 0 },
            };
            for (const inv of unpaidInvoices) {
              const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.issueDate);
              const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
              const amt = toNum(inv.totalAmount);
              if (daysOverdue <= 0) { buckets['Current'].count++; buckets['Current'].amount += amt; }
              else if (daysOverdue <= 30) { buckets['1-30 days'].count++; buckets['1-30 days'].amount += amt; }
              else if (daysOverdue <= 60) { buckets['31-60 days'].count++; buckets['31-60 days'].amount += amt; }
              else if (daysOverdue <= 90) { buckets['61-90 days'].count++; buckets['61-90 days'].amount += amt; }
              else { buckets['90+ days'].count++; buckets['90+ days'].amount += amt; }
            }
            const total = Object.values(buckets).reduce((s, b) => s + b.amount, 0);
            const rows = Object.entries(buckets).map(([label, b]) => ({
              label, amount: b.amount, type: 'item', count: b.count,
            }));
            rows.push({ label: 'Total AR', amount: total, type: 'total', count: unpaidInvoices.length });
            return {
              title: 'Accounts Receivable Aging',
              headers: ['Age Bucket', 'Amount', '# Invoices'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `${unpaidInvoices.length} unpaid invoices | Total AR: $${total.toFixed(2)}`,
            };
          }

          // ---- Accounts Payable Aging ----
          case "accounts_payable": {
            const now = new Date();
            const unpaidPOs = (await db.getPurchaseOrders()).filter((po: any) => po.status !== 'paid' && po.status !== 'cancelled');
            const buckets: Record<string, { count: number; amount: number }> = {
              'Current': { count: 0, amount: 0 },
              '1-30 days': { count: 0, amount: 0 },
              '31-60 days': { count: 0, amount: 0 },
              '61-90 days': { count: 0, amount: 0 },
              '90+ days': { count: 0, amount: 0 },
            };
            for (const po of unpaidPOs) {
              const dueDate = (po as any).dueDate ? new Date((po as any).dueDate) : ((po as any).orderDate ? new Date((po as any).orderDate) : new Date((po as any).createdAt));
              const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
              const amt = toNum((po as any).totalAmount);
              if (daysOverdue <= 0) { buckets['Current'].count++; buckets['Current'].amount += amt; }
              else if (daysOverdue <= 30) { buckets['1-30 days'].count++; buckets['1-30 days'].amount += amt; }
              else if (daysOverdue <= 60) { buckets['31-60 days'].count++; buckets['31-60 days'].amount += amt; }
              else if (daysOverdue <= 90) { buckets['61-90 days'].count++; buckets['61-90 days'].amount += amt; }
              else { buckets['90+ days'].count++; buckets['90+ days'].amount += amt; }
            }
            const total = Object.values(buckets).reduce((s, b) => s + b.amount, 0);
            const rows = Object.entries(buckets).map(([label, b]) => ({
              label, amount: b.amount, type: 'item', count: b.count,
            }));
            rows.push({ label: 'Total AP', amount: total, type: 'total', count: unpaidPOs.length });
            return {
              title: 'Accounts Payable Aging',
              headers: ['Age Bucket', 'Amount', '# Bills'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `${unpaidPOs.length} unpaid bills | Total AP: $${total.toFixed(2)}`,
            };
          }

          // ---- COGS Summary ----
          case "cogs_summary": {
            const cogsRecords = (await db.getCogsRecords()).filter((r: any) => inRange(r.soldAt || r.createdAt));
            const products = await db.getProducts();
            const prodMap = new Map(products.map((p: any) => [p.id, p.name || p.sku || `Product ${p.id}`]));
            const cogsMap: Record<string, { qty: number; cost: number }> = {};
            for (const r of cogsRecords) {
              const name = prodMap.get((r as any).productId) || 'Unknown';
              if (!cogsMap[name]) cogsMap[name] = { qty: 0, cost: 0 };
              cogsMap[name].qty += toNum((r as any).quantitySold);
              cogsMap[name].cost += toNum((r as any).totalCost);
            }
            const sorted = Object.entries(cogsMap).sort((a, b) => b[1].cost - a[1].cost);
            const total = sorted.reduce((s, [, v]) => s + v.cost, 0);
            const rows = sorted.map(([name, data]) => ({
              label: name, amount: data.cost, type: 'item', quantity: data.qty,
            }));
            rows.push({ label: 'Total COGS', amount: total, type: 'total', quantity: sorted.reduce((s, [, v]) => s + v.qty, 0) });
            return {
              title: 'Cost of Goods Sold',
              headers: ['Product', 'Qty Sold', 'Total COGS'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `Total COGS: $${total.toFixed(2)}`,
            };
          }

          // ---- Inventory Valuation ----
          case "inventory_valuation": {
            const inventory = await db.getInventory();
            const products = await db.getProducts();
            const prodMap = new Map(products.map((p: any) => [p.id, p]));
            const rows: any[] = [];
            let totalValue = 0;
            for (const inv of inventory) {
              const prod = prodMap.get((inv as any).productId);
              const qty = toNum(inv.quantity);
              const cost = toNum(prod?.costPrice || 0);
              const value = qty * cost;
              totalValue += value;
              rows.push({
                label: prod?.name || prod?.sku || 'Unknown',
                amount: value,
                type: 'item',
                quantity: qty,
                unitCost: cost,
              });
            }
            rows.sort((a: any, b: any) => b.amount - a.amount);
            rows.push({ label: 'Total Inventory Value', amount: totalValue, type: 'total', quantity: null, unitCost: null });
            return {
              title: 'Inventory Valuation',
              headers: ['Product', 'Quantity', 'Unit Cost', 'Total Value'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `Total inventory value: $${totalValue.toFixed(2)}`,
            };
          }

          // ---- Tax Summary ----
          case "tax_summary": {
            const invoices = (await db.getInvoices({ status: 'paid' })).filter(i => inRange(i.issueDate));
            const totalRevenue = invoices.reduce((s, i) => s + toNum(i.totalAmount), 0);
            const totalTaxCollected = invoices.reduce((s, i) => s + toNum((i as any).taxAmount || 0), 0);
            const transactions = (await db.getTransactions({ type: 'expense' })).filter(t => inRange(t.date));
            const deductibleExpenses = transactions.reduce((s, t) => s + toNum(t.totalAmount), 0);
            const taxableIncome = totalRevenue - deductibleExpenses;
            const estimatedTax = Math.max(0, taxableIncome * 0.21); // 21% corporate rate

            const rows: any[] = [
              { label: 'Total Revenue', amount: totalRevenue, type: 'item' },
              { label: 'Sales Tax Collected', amount: totalTaxCollected, type: 'item' },
              { label: 'Deductible Expenses', amount: deductibleExpenses, type: 'item' },
              { label: 'Taxable Income', amount: taxableIncome, type: 'subtotal' },
              { label: 'Estimated Federal Tax (21%)', amount: estimatedTax, type: 'total' },
            ];
            return {
              title: 'Tax Summary',
              headers: ['Item', 'Amount'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `Revenue: $${totalRevenue.toFixed(2)} | Taxable Income: $${taxableIncome.toFixed(2)} | Est. Tax: $${estimatedTax.toFixed(2)}`,
            };
          }

          // ---- Monthly Financial Summary ----
          case "monthly_summary": {
            const invoices = (await db.getInvoices({ status: 'paid' })).filter(i => inRange(i.issueDate));
            const transactions = (await db.getTransactions({ type: 'expense' })).filter(t => inRange(t.date));

            const monthlyData: Record<string, { revenue: number; expenses: number }> = {};
            for (const inv of invoices) {
              const d = new Date(inv.issueDate);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              if (!monthlyData[key]) monthlyData[key] = { revenue: 0, expenses: 0 };
              monthlyData[key].revenue += toNum(inv.totalAmount);
            }
            for (const t of transactions) {
              const d = new Date(t.date);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              if (!monthlyData[key]) monthlyData[key] = { revenue: 0, expenses: 0 };
              monthlyData[key].expenses += toNum(t.totalAmount);
            }

            const sorted = Object.entries(monthlyData).sort((a, b) => a[0].localeCompare(b[0]));
            let cumulative = 0;
            const rows = sorted.map(([month, data]) => {
              const net = data.revenue - data.expenses;
              cumulative += net;
              return { label: month, amount: net, type: 'item', revenue: data.revenue, expenses: data.expenses, cumulative };
            });
            return {
              title: 'Monthly Financial Summary',
              headers: ['Month', 'Revenue', 'Expenses', 'Net', 'Cumulative'],
              rows,
              generatedAt: new Date().toISOString(),
              summary: `${sorted.length} months | Cumulative: $${cumulative.toFixed(2)}`,
            };
          }

          default:
            throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown report type: ${input.reportType}` });
        }
      }),

    aiAnalysis: financeProcedure
      .input(z.object({ reportType: z.string(), reportData: z.string() }))
      .mutation(async ({ input }) => {
        const result = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: 'You are a startup CFO. Provide concise, actionable financial analysis.',
            },
            {
              role: 'user',
              content: `Analyze this ${input.reportType} financial report for Superhumn Inc (a CPG startup) and provide:
1. Key takeaways (3-5 bullet points)
2. Areas of concern
3. Recommendations
4. Comparison to typical startup benchmarks

Report data: ${input.reportData}`,
            },
          ],
        });
        const content = result.choices?.[0]?.message?.content;
        const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c: any) => c.text || '').join('') : '';
        return { analysis: text };
      }),

    autoCategorize: financeProcedure
      .mutation(async () => {
        const allTransactions = await db.getTransactions();
        const uncategorized = allTransactions.filter((t: any) => !t.accountId && !t.category);
        const accounts = await db.getAccounts();
        const accountList = accounts.map((a: any) => `${a.code}: ${a.name} (${a.type})`).join(', ');

        let categorized = 0;
        for (const txn of uncategorized) {
          try {
            const result = await invokeLLM({
              messages: [{
                role: 'user',
                content: `Categorize this business transaction for a CPG food company:
Description: ${(txn as any).description || (txn as any).reference || 'N/A'}
Amount: ${txn.totalAmount}
Date: ${txn.date}
Type: ${txn.type}

Available categories: ${accountList}

Return ONLY valid JSON: { "accountCode": "string", "category": "string" }`,
              }],
            });
            const raw = typeof result.choices?.[0]?.message?.content === 'string'
              ? result.choices[0].message.content
              : '';
            const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.accountCode) {
              const matchedAccount = accounts.find((a: any) => a.code === parsed.accountCode);
              if (matchedAccount) {
                categorized++;
              }
            }
          } catch { /* skip unparseable */ }
        }
        return { categorized, total: uncategorized.length };
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
