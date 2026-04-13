import { z } from "zod";
import * as db from "../db";
import { router, protectedProcedure, adminProcedure, financeProcedure, createAuditLog, generateNumber } from "./middleware";

export const hrRouter = router({
  // ============================================
  // HR - DEPARTMENTS
  // ============================================
  departments: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getDepartments(input?.companyId)),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        code: z.string().optional(),
        parentDepartmentId: z.number().optional(),
        managerId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createDepartment(input);
        await createAuditLog(ctx.user.id, 'create', 'department', result.id, input.name);
        return result;
      }),
  }),
  // ============================================
  // HR - EMPLOYEES
  // ============================================
  employees: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        departmentId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getEmployees(input)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getEmployeeById(input.id)),
    create: adminProcedure
      .input(z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        companyId: z.number().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        hireDate: z.date().optional(),
        departmentId: z.number().optional(),
        managerId: z.number().optional(),
        jobTitle: z.string().optional(),
        employmentType: z.enum(['full_time', 'part_time', 'contractor', 'intern']).optional(),
        salary: z.string().optional(),
        salaryFrequency: z.enum(['hourly', 'weekly', 'biweekly', 'monthly', 'annual']).optional(),
        currency: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const employeeNumber = generateNumber('EMP');
        const result = await db.createEmployee({ ...input, employeeNumber });
        await createAuditLog(ctx.user.id, 'create', 'employee', result.id, `${input.firstName} ${input.lastName}`);
        return result;
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        departmentId: z.number().optional(),
        managerId: z.number().optional(),
        jobTitle: z.string().optional(),
        status: z.enum(['active', 'inactive', 'on_leave', 'terminated']).optional(),
        salary: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateEmployee(id, data);
        await createAuditLog(ctx.user.id, 'update', 'employee', id);
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteEmployee(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'employee', input.id);
        return { success: true };
      }),
    compensationHistory: protectedProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(({ input }) => db.getCompensationHistory(input.employeeId)),
    addCompensation: adminProcedure
      .input(z.object({
        employeeId: z.number(),
        effectiveDate: z.date(),
        salary: z.string(),
        salaryFrequency: z.enum(['hourly', 'weekly', 'biweekly', 'monthly', 'annual']).optional(),
        currency: z.string().optional(),
        reason: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createCompensationRecord({ ...input, approvedBy: ctx.user.id });
        await db.updateEmployee(input.employeeId, { salary: input.salary, salaryFrequency: input.salaryFrequency });
        await createAuditLog(ctx.user.id, 'create', 'compensation', result.id);
        return result;
      }),
  }),
  // ============================================
  // HR - EMPLOYEE PAYMENTS
  // ============================================
  employeePayments: router({
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
  }),
});
