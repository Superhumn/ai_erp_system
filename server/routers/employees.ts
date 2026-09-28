// appRouter.employees — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import {
  getLinkCandidates,
  getLinkedUser,
  linkEmployeeToUser,
  unlinkEmployeeFromUser,
  type LinkFailure,
} from "../employeeLinkService";
import { adminProcedure, execProcedure, internalProcedure, createAuditLog, generateNumber, resolveRequestScope, assertNonEmptyScope } from "./_shared";

// Linking a login to an employee grants that login the employee's portal
// (payslips, documents, PTO). There is no HR role, so it is admin-only, and
// fenced to the admin's entity scope: an employee outside it reads as NOT_FOUND.
const scopedAdminProcedure = adminProcedure.use(async ({ ctx, next }) => {
  const scope = assertNonEmptyScope(await resolveRequestScope(ctx.user));
  return next({ ctx: { ...ctx, scope } });
});

function isLinkFailure(v: unknown): v is LinkFailure {
  return typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;
}

function throwLinkFailure(f: LinkFailure): never {
  throw new TRPCError({ code: f.code, message: f.message });
}

// ============================================
// HR - EMPLOYEES
// ============================================
export const employeesRouter = router({
    // Employee records carry salary and personal details. Internal staff only —
    // external portal roles (vendor, copacker, contractor, investor) are blocked.
    list: internalProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
        departmentId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getEmployees(input)),
    get: internalProcedure
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
    update: execProcedure
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
    compensationHistory: internalProcedure
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

    // ---- login account (employees.userId) ------------------------------
    linkedUser: scopedAdminProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ input, ctx }) => {
        const res = await getLinkedUser(input.employeeId, ctx.scope);
        if (isLinkFailure(res)) throwLinkFailure(res);
        return res;
      }),
    linkCandidates: scopedAdminProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ input, ctx }) => {
        const res = await getLinkCandidates(input.employeeId, ctx.scope);
        if (isLinkFailure(res)) throwLinkFailure(res);
        return res;
      }),
    linkUser: scopedAdminProcedure
      .input(z.object({ employeeId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const res = await linkEmployeeToUser({ ...input, actorUserId: ctx.user.id, scope: ctx.scope });
        if (res.ok === false) throwLinkFailure(res);
        return { success: true, changed: res.changed };
      }),
    unlinkUser: scopedAdminProcedure
      .input(z.object({ employeeId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const res = await unlinkEmployeeFromUser({ employeeId: input.employeeId, actorUserId: ctx.user.id, scope: ctx.scope });
        if (res.ok === false) throwLinkFailure(res);
        return { success: true, changed: res.changed };
      }),
  });
