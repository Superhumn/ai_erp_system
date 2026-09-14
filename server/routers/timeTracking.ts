// appRouter.timeTracking — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { sendEmail } from "../_core/email";
import * as db from "../db";
import { adminProcedure } from "./_shared";

// ============================================
// TIME TRACKING
// ============================================
export const timeTrackingRouter = router({
    entries: router({
      list: protectedProcedure
        .input(z.object({
          userId: z.number().optional(),
          status: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }).optional())
        .query(({ input, ctx }) => db.getTimeEntries({ ...input, userId: input?.userId || ctx.user.id })),

      create: protectedProcedure
        .input(z.object({
          taskDescription: z.string().min(1),
          date: z.string(),
          hours: z.string(),
          hourlyRate: z.string().optional(),
          category: z.enum(["development", "design", "consulting", "management", "operations", "admin", "sales", "support", "other"]).optional(),
          billable: z.boolean().optional(),
          projectId: z.number().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const rate = parseFloat(input.hourlyRate || "0");
          const hrs = parseFloat(input.hours);
          const result = await db.createTimeEntry({
            ...input,
            userId: ctx.user.id,
            date: new Date(input.date),
            totalAmount: (rate * hrs).toFixed(2),
          });
          return result;
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          taskDescription: z.string().optional(),
          date: z.string().optional(),
          hours: z.string().optional(),
          hourlyRate: z.string().optional(),
          category: z.enum(["development", "design", "consulting", "management", "operations", "admin", "sales", "support", "other"]).optional(),
          billable: z.boolean().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          await db.updateTimeEntry(id, {
            ...data,
            date: data.date ? new Date(data.date) : undefined,
          } as any);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteTimeEntry(input.id);
          return { success: true };
        }),

      submit: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.updateTimeEntry(input.id, { status: "submitted" } as any);
          return { success: true };
        }),

      approve: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.updateTimeEntry(input.id, { status: "approved", approvedBy: ctx.user.id, approvedAt: new Date() } as any);
          return { success: true };
        }),
    }),

    invoices: router({
      list: protectedProcedure
        .input(z.object({ userId: z.number().optional(), status: z.string().optional() }).optional())
        .query(({ input, ctx }) => db.getTimeInvoices({ ...input, userId: input?.userId || ctx.user.id })),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getTimeInvoiceById(input.id)),
    }),

    generateInvoice: protectedProcedure
      .input(z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        hourlyRate: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 1. Get all approved/submitted time entries for this user in the date range
        const entries = await db.getTimeEntries({
          userId: ctx.user.id,
          startDate: input.periodStart,
          endDate: input.periodEnd,
        });

        const billableEntries = entries.filter(e =>
          (e.status === "approved" || e.status === "submitted") && e.billable
        );

        if (billableEntries.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No approved/submitted billable time entries found for this period" });
        }

        // 2. Calculate totals
        const totalHours = billableEntries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);
        const rate = parseFloat(input.hourlyRate);
        const subtotal = totalHours * rate;
        const totalAmount = subtotal; // No tax by default

        // 3. Generate invoice number
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

        // 4. Create timeInvoice record
        const invoice = await db.createTimeInvoice({
          userId: ctx.user.id,
          invoiceNumber,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          totalHours: totalHours.toFixed(2),
          hourlyRate: rate.toFixed(2),
          subtotal: subtotal.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          status: "draft",
        });

        // 5. Mark all those time entries as "invoiced"
        for (const entry of billableEntries) {
          await db.updateTimeEntry(entry.id, { status: "invoiced" } as any);
        }

        return { id: invoice.id, invoiceNumber, totalHours, totalAmount, entriesCount: billableEntries.length };
      }),

    submitInvoice: protectedProcedure
      .input(z.object({ invoiceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // 1. Get the invoice
        const invoice = await db.getTimeInvoiceById(input.invoiceId);
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
        }

        // 2. Get user details
        const allUsers = await db.getAllUsers();
        const user = allUsers.find(u => u.id === ctx.user.id);
        const userName = user?.name || user?.email || "Contractor";
        const userEmail = user?.email || "noreply@superhumn.com";

        // 3. Get all time entries for this invoice period
        const entries = await db.getTimeEntries({
          userId: ctx.user.id,
          startDate: invoice.periodStart.toISOString(),
          endDate: invoice.periodEnd.toISOString(),
        });
        const invoicedEntries = entries.filter(e => e.status === "invoiced");

        // 4. Build professional HTML invoice email
        const periodStr = `${invoice.periodStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - ${invoice.periodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

        const entryRows = invoicedEntries.map(e => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">${new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;">${e.taskDescription}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;">${e.category || "other"}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${parseFloat(String(e.hours)).toFixed(2)}</td>
          </tr>
        `).join("");

        const html = `
        <div style="max-width:680px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#333;">
          <div style="background:#1a1a2e;color:white;padding:24px 32px;border-radius:8px 8px 0 0;">
            <h1 style="margin:0;font-size:24px;">INVOICE</h1>
            <p style="margin:4px 0 0;opacity:0.8;font-size:14px;">${invoice.invoiceNumber}</p>
          </div>

          <div style="padding:24px 32px;border:1px solid #e5e7eb;border-top:none;">
            <table style="width:100%;margin-bottom:24px;">
              <tr>
                <td style="vertical-align:top;">
                  <strong>From:</strong><br/>
                  ${userName}<br/>
                  ${userEmail}
                </td>
                <td style="vertical-align:top;text-align:right;">
                  <strong>Invoice #:</strong> ${invoice.invoiceNumber}<br/>
                  <strong>Period:</strong> ${periodStr}<br/>
                  <strong>Date:</strong> ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
              </tr>
            </table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #dee2e6;font-size:13px;">Date</th>
                  <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #dee2e6;font-size:13px;">Task</th>
                  <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #dee2e6;font-size:13px;">Category</th>
                  <th style="padding:10px 8px;text-align:right;border-bottom:2px solid #dee2e6;font-size:13px;">Hours</th>
                </tr>
              </thead>
              <tbody>
                ${entryRows}
              </tbody>
            </table>

            <div style="background:#f8f9fa;padding:16px;border-radius:6px;margin-bottom:16px;">
              <table style="width:100%;">
                <tr><td><strong>Total Hours:</strong></td><td style="text-align:right;">${parseFloat(String(invoice.totalHours)).toFixed(2)}</td></tr>
                <tr><td><strong>Hourly Rate:</strong></td><td style="text-align:right;">$${parseFloat(String(invoice.hourlyRate)).toFixed(2)}</td></tr>
                <tr style="font-size:18px;"><td><strong>Total Due:</strong></td><td style="text-align:right;"><strong>$${parseFloat(String(invoice.totalAmount)).toFixed(2)}</strong></td></tr>
              </table>
            </div>

            ${invoice.notes ? `<p style="font-size:13px;color:#666;"><strong>Notes:</strong> ${invoice.notes}</p>` : ""}
          </div>

          <div style="background:#f8f9fa;padding:16px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <p style="margin:0;font-size:12px;color:#888;">This invoice was generated automatically by Superhumn ERP. Please process payment at your earliest convenience.</p>
          </div>
        </div>
        `;

        // 5. Send email
        const emailResult = await sendEmail({
          to: "superhumn@ap.mercury.com",
          from: userEmail,
          subject: `Invoice ${invoice.invoiceNumber} from ${userName} — ${periodStr}`,
          html,
        });

        // 6. Mark invoice as sent
        const now = new Date();
        await db.updateTimeInvoice(input.invoiceId, {
          status: "sent",
          sentAt: now,
          sentTo: "superhumn@ap.mercury.com",
          submittedAt: now,
        } as any);

        return {
          success: emailResult.success,
          invoiceNumber: invoice.invoiceNumber,
          sentTo: "superhumn@ap.mercury.com",
          error: emailResult.error,
        };
      }),
  });
