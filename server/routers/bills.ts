// appRouter.bills — vendor bills (accounts payable).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { financeProcedure, resolveRequestScope, assertNonEmptyScope, createAuditLog, generateNumber } from "./_shared";
import { scopeAllows, scopeCompanyIds } from "../_core/scope";
import { billOutstanding, bucketBillsAging } from "../billsLogic";
import { payBill, BillPaymentError, billFromParsedInvoice } from "../billsService";
import { parseUploadedDocument } from "../documentImportService";

// ============================================
// FINANCE - BILLS
// ============================================

// Ops receive the goods and key in the vendor's bill; approving and paying stays
// with finance. _shared has no combined guard, so define it here (as inventoryCosting does).
const opsOrFinanceProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "finance", "exec", "ops"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Finance or operations access required" });
  }
  return next({ ctx });
});

const BILL_STATUSES = ["draft", "pending_approval", "approved", "scheduled", "partially_paid", "paid", "overdue", "cancelled", "disputed"] as const;
// A bill is keyed in as a draft or handed straight to finance; approved / paid are only ever
// reached through `approve` and `markPaid` (finance-only), never from the create payload.
const BILL_CREATE_STATUSES = ["draft", "pending_approval"] as const;
const BILL_SOURCES = ["manual", "email", "document_import", "ai_draft", "quickbooks"] as const;
const PAYMENT_METHODS = ["cash", "check", "bank_transfer", "credit_card", "ach", "wire", "other"] as const;

const lineItemSchema = z.object({
  description: z.string(),
  sku: z.string().optional(),
  quantity: z.number(),
  unit: z.string().optional(),
  unitPrice: z.number(),
  totalPrice: z.number(),
});

const billFieldsSchema = z.object({
  companyId: z.number().optional(),
  billNumber: z.string().max(64).optional(),
  vendorId: z.number(),
  purchaseOrderId: z.number().nullable().optional(),
  sourceType: z.enum(BILL_SOURCES).optional(),
  sourceRef: z.string().max(128).nullable().optional(),
  billDate: z.coerce.date(),
  dueDate: z.coerce.date().nullable().optional(),
  subtotal: z.string().optional(),
  taxAmount: z.string().optional(),
  shippingAmount: z.string().optional(),
  totalAmount: z.string(),
  currency: z.string().length(3).optional(),
  status: z.enum(BILL_STATUSES).optional(),
  paymentTerms: z.string().max(64).nullable().optional(),
  autopay: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  attachmentUrl: z.string().max(512).nullable().optional(),
  lineItems: z.array(lineItemSchema).nullable().optional(),
});

type BillRow = NonNullable<Awaited<ReturnType<typeof db.getBillById>>>;

/** Load a bill the caller's entity scope may see; anything else is NOT_FOUND (never "forbidden", which leaks existence). */
async function loadScopedBill(user: Parameters<typeof resolveRequestScope>[0], id: number): Promise<BillRow> {
  const scope = assertNonEmptyScope(await resolveRequestScope(user));
  const bill = await db.getBillById(id);
  if (!bill || !scopeAllows(scope, bill.companyId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
  }
  return bill;
}

function assertBillOpen(bill: BillRow, action: string) {
  if (bill.status === "paid" || bill.status === "cancelled") {
    throw new TRPCError({ code: "FORBIDDEN", message: `Cannot ${action} a bill that is already ${bill.status}` });
  }
}

export const billsRouter = router({
    // financeProcedure keeps the role gate; entity scope is resolved server-side (companyId is never client input here).
    list: financeProcedure
      .input(z.object({
        status: z.enum(BILL_STATUSES).optional(),
        vendorId: z.number().optional(),
        dueBefore: z.coerce.date().optional(),
        dueAfter: z.coerce.date().optional(),
        limit: z.number().int().positive().max(1000).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const scope = assertNonEmptyScope(await resolveRequestScope(ctx.user));
        const companyIds = scopeCompanyIds(scope);
        return db.getBills({
          companyIds: companyIds ?? undefined,
          status: input?.status,
          vendorId: input?.vendorId,
          dueBefore: input?.dueBefore,
          dueAfter: input?.dueAfter,
          limit: input?.limit,
        });
      }),

    get: financeProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const bill = await loadScopedBill(ctx.user, input.id);
        return { ...bill, outstanding: billOutstanding(bill) };
      }),

    aging: financeProcedure
      .query(async ({ ctx }) => {
        const scope = assertNonEmptyScope(await resolveRequestScope(ctx.user));
        const companyIds = scopeCompanyIds(scope);
        // A single-entity scope maps onto getBillsAgingSummary's companyId; wider scopes bucket the visible rows.
        if (companyIds && companyIds.length === 1) return db.getBillsAgingSummary(companyIds[0]);
        return bucketBillsAging(await db.getBills({ companyIds: companyIds ?? undefined }));
      }),

    create: opsOrFinanceProcedure
      .input(billFieldsSchema.extend({ status: z.enum(BILL_CREATE_STATUSES).default("draft") }))
      .mutation(async ({ input, ctx }) => {
        // bills.list is entity-scoped; default companyId to the caller's home entity or the
        // row is stored NULL and disappears from the creator's own list.
        const companyId = input.companyId ?? ctx.user.companyId ?? undefined;
        const billNumber = input.billNumber || generateNumber("BILL");
        const vendor = await db.getVendorById(input.vendorId);
        if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
        const { id } = await db.createBill({
          ...input,
          companyId,
          billNumber,
          sourceType: input.sourceType ?? "manual",
          status: input.status,
          lineItems: input.lineItems ?? undefined,
          createdBy: ctx.user.id,
        });
        await createAuditLog(ctx.user.id, "create", "bill", id, billNumber, undefined, { vendorId: input.vendorId, totalAmount: input.totalAmount });
        return db.getBillById(id);
      }),

    update: opsOrFinanceProcedure
      .input(billFieldsSchema.omit({ companyId: true }).partial().extend({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...changes } = input;
        const bill = await loadScopedBill(ctx.user, id);
        // amountPaid is only ever moved by recordBillPayment (markPaid / the payment workflow).
        const { lineItems, ...rest } = changes;
        const updated = await db.updateBill(id, { ...rest, lineItems: lineItems ?? undefined });
        await createAuditLog(ctx.user.id, "update", "bill", id, bill.billNumber, bill, changes);
        return updated;
      }),

    approve: financeProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const bill = await loadScopedBill(ctx.user, input.id);
        assertBillOpen(bill, "approve");
        const updated = await db.updateBill(input.id, { status: "approved", approvedBy: ctx.user.id, approvedAt: new Date() });
        await createAuditLog(ctx.user.id, "approve", "bill", input.id, bill.billNumber, { status: bill.status }, { status: "approved" });
        return updated;
      }),

    markPaid: financeProcedure
      .input(z.object({
        id: z.number(),
        amount: z.number().positive().optional(),
        paymentDate: z.coerce.date().optional(),
        paymentMethod: z.enum(PAYMENT_METHODS).optional(),
        referenceNumber: z.string().max(128).optional(),
        accountId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const bill = await loadScopedBill(ctx.user, input.id);
        try {
          const result = await payBill(input.id, {
            amount: input.amount,
            paymentDate: input.paymentDate,
            paymentMethod: input.paymentMethod,
            referenceNumber: input.referenceNumber,
            accountId: input.accountId,
            notes: input.notes,
            createdBy: ctx.user.id,
            paymentNumber: generateNumber("PAY"),
          });
          await createAuditLog(ctx.user.id, "update", "bill", input.id, bill.billNumber, { status: bill.status, amountPaid: bill.amountPaid }, { paymentId: result.paymentId, amount: result.amount, status: result.bill?.status });
          return result.bill;
        } catch (e) {
          if (e instanceof BillPaymentError) throw new TRPCError({ code: e.code, message: e.message });
          throw e;
        }
      }),

    cancel: financeProcedure
      .input(z.object({ id: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const bill = await loadScopedBill(ctx.user, input.id);
        assertBillOpen(bill, "cancel");
        const notes = input.reason
          ? (bill.notes ? `${bill.notes}\nCancelled: ${input.reason}` : `Cancelled: ${input.reason}`)
          : bill.notes;
        const updated = await db.updateBill(input.id, { status: "cancelled", notes });
        await createAuditLog(ctx.user.id, "update", "bill", input.id, bill.billNumber, { status: bill.status }, { status: "cancelled", reason: input.reason });
        return updated;
      }),

    // Free text (a pasted invoice email, an OCR dump) → draft bill. Reuses the document
    // parser: plain text is handed over as a data: URL, which its text branch reads as-is.
    createFromText: opsOrFinanceProcedure
      .input(z.object({
        text: z.string().min(10).max(50000),
        createMissingVendor: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const dataUrl = `data:text/plain;base64,${Buffer.from(input.text, "utf8").toString("base64")}`;
        const parsed = await parseUploadedDocument(dataUrl, "bill-from-text.txt", undefined, "text/plain");
        const invoice = parsed.vendorInvoice;
        if (!parsed.success || !invoice || !invoice.vendorName || !invoice.totalAmount) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: parsed.error || `Could not read a vendor bill from that text (detected: ${parsed.documentType}).`,
          });
        }

        let vendor = (await db.getVendorByName(invoice.vendorName))
          || (invoice.vendorEmail ? await db.findVendorByEmailOrName(invoice.vendorEmail, invoice.vendorName) : null);
        let createdVendor = false;
        if (!vendor) {
          if (!input.createMissingVendor) {
            throw new TRPCError({ code: "NOT_FOUND", message: `Vendor "${invoice.vendorName}" was not found. Enable "Add vendor if missing" or add the vendor first.` });
          }
          const { id } = await db.createVendor({ name: invoice.vendorName, email: invoice.vendorEmail || "", type: "supplier", status: "active", companyId: ctx.user.companyId ?? undefined });
          vendor = (await db.getVendorById(id)) ?? null;
          createdVendor = true;
        }
        if (!vendor) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Vendor could not be created" });

        const billNumber = invoice.invoiceNumber || generateNumber("BILL");
        const existing = await db.findBillByNumber(billNumber, vendor.id);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: `Bill ${billNumber} already exists for ${vendor.name} (#${existing.id})` });

        let purchaseOrderId: number | undefined;
        if (invoice.relatedPoNumber) {
          const po = await db.findPurchaseOrderByNumber(invoice.relatedPoNumber);
          if (po) purchaseOrderId = po.id;
        }
        const { id } = await db.createBill(billFromParsedInvoice({ ...invoice, invoiceNumber: billNumber }, {
          vendorId: vendor.id,
          sourceType: "ai_draft",
          purchaseOrderId,
          companyId: ctx.user.companyId ?? vendor.companyId ?? undefined,
          createdBy: ctx.user.id,
        }));
        await createAuditLog(ctx.user.id, "create", "bill", id, billNumber, undefined, { vendorId: vendor.id, totalAmount: invoice.totalAmount, source: "ai_draft" });
        return { bill: await db.getBillById(id), createdVendor, confidence: invoice.confidence };
      }),
  });

