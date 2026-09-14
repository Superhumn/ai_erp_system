// appRouter.employeePayments — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { financeProcedure, createAuditLog, generateNumber } from "./_shared";

// ============================================
// HR - EMPLOYEE PAYMENTS
// ============================================
export const employeePaymentsRouter = router({
    list: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        employeeId: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getEmployeePayments(input)),
    create: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        employeeId: z.number(),
        type: z.enum(['salary', 'bonus', 'commission', 'reimbursement', 'other']).optional(),
        amount: z.string(),
        currency: z.string().optional(),
        paymentDate: z.date(),
        payPeriodStart: z.date().optional(),
        payPeriodEnd: z.date().optional(),
        paymentMethod: z.enum(['check', 'direct_deposit', 'wire', 'other']).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const paymentNumber = generateNumber('EMPAY');
        const result = await db.createEmployeePayment({ ...input, paymentNumber, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'employeePayment', result.id, paymentNumber);
        return result;
      }),
  });
