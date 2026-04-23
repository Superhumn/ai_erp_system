import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import { router, protectedProcedure, createAuditLog } from "./middleware";

const LEAVE_TYPES = [
  "vacation",
  "sick",
  "personal",
  "parental",
  "bereavement",
  "unpaid",
  "other",
] as const;

const BENEFIT_TYPES = [
  "health",
  "dental",
  "vision",
  "retirement_401k",
  "life_insurance",
  "disability",
  "hsa",
  "fsa",
  "commuter",
  "other",
] as const;

const COVERAGE_LEVELS = [
  "employee_only",
  "employee_spouse",
  "employee_children",
  "family",
  "waived",
] as const;

const ENROLLMENT_STATUSES = ["enrolled", "pending", "waived", "terminated"] as const;

const ONBOARDING_CATEGORIES = [
  "paperwork",
  "training",
  "equipment",
  "access",
  "introduction",
  "acknowledgment",
  "other",
] as const;

const ONBOARDING_STATUSES = ["pending", "in_progress", "completed", "skipped"] as const;

async function requireEmployee(userId: number) {
  const employee = await db.getEmployeeByUserId(userId);
  if (!employee) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No employee record linked to this user. Contact HR.",
    });
  }
  return employee;
}

function canViewEmployee(role: string, actingEmployeeId: number, targetEmployeeId: number) {
  if (actingEmployeeId === targetEmployeeId) return true;
  return ["admin", "exec"].includes(role);
}

export const employeePortalRouter = router({
    // ---- Profile ----
    me: protectedProcedure.query(async ({ ctx }) => {
      const employee = await db.getEmployeeByUserId(ctx.user.id);
      if (!employee) return null;
      const department = employee.departmentId
        ? (await db.getDepartments()).find((d) => d.id === employee.departmentId)
        : undefined;
      return { ...employee, department: department ?? null };
    }),

    updateProfile: protectedProcedure
      .input(
        z.object({
          phone: z.string().optional(),
          personalEmail: z.string().email().optional().or(z.literal("")),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          postalCode: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const employee = await requireEmployee(ctx.user.id);
        await db.updateEmployee(employee.id, input);
        await createAuditLog(ctx.user.id, "update", "employee", employee.id, "self-service profile");
        return { success: true };
      }),

    // ---- Emergency contacts ----
    emergencyContacts: protectedProcedure.query(async ({ ctx }) => {
      const employee = await requireEmployee(ctx.user.id);
      return db.getEmergencyContacts(employee.id);
    }),

    addEmergencyContact: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          relationship: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().email().optional().or(z.literal("")),
          address: z.string().optional(),
          isPrimary: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const employee = await requireEmployee(ctx.user.id);
        return db.createEmergencyContact({
          ...input,
          employeeId: employee.id,
          isPrimary: input.isPrimary ?? false,
        });
      }),

    updateEmergencyContact: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          relationship: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().email().optional().or(z.literal("")),
          address: z.string().optional(),
          isPrimary: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const employee = await requireEmployee(ctx.user.id);
        const contacts = await db.getEmergencyContacts(employee.id);
        if (!contacts.some((c) => c.id === input.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your contact" });
        }
        const { id, ...data } = input;
        await db.updateEmergencyContact(id, data);
        return { success: true };
      }),

    deleteEmergencyContact: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const employee = await requireEmployee(ctx.user.id);
        const contacts = await db.getEmergencyContacts(employee.id);
        if (!contacts.some((c) => c.id === input.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your contact" });
        }
        await db.deleteEmergencyContact(input.id);
        return { success: true };
      }),

    // ---- Pay ----
    payslips: protectedProcedure.query(async ({ ctx }) => {
      const employee = await requireEmployee(ctx.user.id);
      return db.getEmployeePayments({ employeeId: employee.id });
    }),

    compensation: protectedProcedure.query(async ({ ctx }) => {
      const employee = await requireEmployee(ctx.user.id);
      return db.getCompensationHistory(employee.id);
    }),

    // ---- PTO balances ----
    ptoBalances: protectedProcedure
      .input(z.object({ year: z.number().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const employee = await requireEmployee(ctx.user.id);
        const year = input?.year ?? new Date().getFullYear();
        return db.getPtoBalances(employee.id, year);
      }),

    // ---- Leave requests ----
    leaveRequests: protectedProcedure.query(async ({ ctx }) => {
      const employee = await requireEmployee(ctx.user.id);
      return db.getLeaveRequests({ employeeId: employee.id });
    }),

    submitLeaveRequest: protectedProcedure
      .input(
        z.object({
          leaveType: z.enum(LEAVE_TYPES),
          startDate: z.date(),
          endDate: z.date(),
          hours: z.number().positive(),
          reason: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (input.endDate < input.startDate) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "End date is before start date" });
        }
        const employee = await requireEmployee(ctx.user.id);
        const result = await db.createLeaveRequestWithPtoAdjustment(
          {
            employeeId: employee.id,
            leaveType: input.leaveType,
            startDate: input.startDate,
            endDate: input.endDate,
            hours: input.hours.toString(),
            reason: input.reason,
            status: "pending",
          },
          { employeeId: employee.id, leaveType: input.leaveType, year: input.startDate.getFullYear(), hours: input.hours },
        );
        await createAuditLog(ctx.user.id, "create", "leave_request", result.id);
        return result;
      }),

    cancelLeaveRequest: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const employee = await requireEmployee(ctx.user.id);
        const req = await db.getLeaveRequestById(input.id);
        if (!req || req.employeeId !== employee.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not your request" });
        }
        if (req.status === "cancelled" || req.status === "rejected") {
          return { success: true };
        }
        const wasApproved = req.status === "approved";
        const year = new Date(req.startDate).getFullYear();
        await db.cancelLeaveRequestWithPtoRestore(
          input.id,
          { employeeId: req.employeeId, leaveType: req.leaveType, year, hours: Number(req.hours), wasApproved },
        );
        await createAuditLog(ctx.user.id, "update", "leave_request", input.id, "cancelled");
        return { success: true };
      }),

    // Manager/admin action — approve/reject
    decideLeaveRequest: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          decision: z.enum(["approved", "rejected"]),
          rejectionReason: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const req = await db.getLeaveRequestById(input.id);
        if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Leave request not found" });
        const target = await db.getEmployeeById(req.employeeId);
        const isManager = target?.managerId && target.managerId === ctx.user.id;
        if (!isManager && !["admin", "exec"].includes(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only managers/admins can decide" });
        }
        if (req.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Request already decided" });
        }
        const year = new Date(req.startDate).getFullYear();
        const hours = Number(req.hours);
        await db.decideLeaveRequestWithPtoAdjustment(
          input.id,
          { status: input.decision, approverId: ctx.user.id, rejectionReason: input.rejectionReason },
          { employeeId: req.employeeId, leaveType: req.leaveType, year, hours, approved: input.decision === "approved" },
        );
        await createAuditLog(ctx.user.id, input.decision === "approved" ? "approve" : "reject", "leave_request", input.id);
        return { success: true };
      }),

    // ---- Onboarding ----
    onboardingTasks: protectedProcedure.query(async ({ ctx }) => {
      const employee = await requireEmployee(ctx.user.id);
      return db.getOnboardingTasks(employee.id);
    }),

    updateOnboardingTask: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(ONBOARDING_STATUSES).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const employee = await requireEmployee(ctx.user.id);
        const tasks = await db.getOnboardingTasks(employee.id);
        const task = tasks.find((t) => t.id === input.id);
        if (!task) throw new TRPCError({ code: "FORBIDDEN", message: "Not your task" });
        await db.updateOnboardingTask(input.id, {
          status: input.status,
          completedAt: input.status === "completed" ? new Date() : null,
        });
        return { success: true };
      }),

    // Admin/HR-only: create a task for an employee
    createOnboardingTask: protectedProcedure
      .input(
        z.object({
          employeeId: z.number(),
          title: z.string().min(1),
          description: z.string().optional(),
          category: z.enum(ONBOARDING_CATEGORIES).optional(),
          dueDate: z.date().optional(),
          sortOrder: z.number().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (!["admin", "exec"].includes(ctx.user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        }
        const result = await db.createOnboardingTask({
          ...input,
          createdBy: ctx.user.id,
          status: "pending",
        });
        await createAuditLog(ctx.user.id, "create", "onboarding_task", result.id, input.title);
        return result;
      }),

    // ---- Benefits ----
    benefits: protectedProcedure.query(async ({ ctx }) => {
      const employee = await requireEmployee(ctx.user.id);
      return db.getEmployeeBenefits(employee.id);
    }),

    upsertBenefitElection: protectedProcedure
      .input(
        z.object({
          benefitType: z.enum(BENEFIT_TYPES),
          plan: z.string().optional(),
          carrier: z.string().optional(),
          coverageLevel: z.enum(COVERAGE_LEVELS).optional(),
          employeeContribution: z.string().optional(),
          employerContribution: z.string().optional(),
          enrollmentStatus: z.enum(ENROLLMENT_STATUSES).optional(),
          effectiveDate: z.date().optional(),
          notes: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const employee = await requireEmployee(ctx.user.id);
        const result = await db.upsertEmployeeBenefit({
          ...input,
          employeeId: employee.id,
          enrollmentStatus: input.enrollmentStatus ?? "pending",
        });
        await createAuditLog(ctx.user.id, "update", "employee_benefit", result.id, input.benefitType);
        return result;
      }),

    // ---- Documents ----
    documents: protectedProcedure.query(async ({ ctx }) => {
      const employee = await requireEmployee(ctx.user.id);
      return db.getDocuments({ referenceType: "employee", referenceId: employee.id });
    }),

    // ---- Directory ----
    directory: protectedProcedure.query(async () => {
      const list = await db.getEmployees({ status: "active" });
      return list.map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        jobTitle: e.jobTitle,
        email: e.email,
        phone: e.phone,
        departmentId: e.departmentId,
      }));
    }),

    // ---- Team (for managers) ----
    myTeam: protectedProcedure.query(async ({ ctx }) => {
      const all = await db.getEmployees();
      const reports = all.filter((e) => e.managerId === ctx.user.id);
      const pending = await db.getLeaveRequests({ status: "pending" });
      const reportIds = new Set(reports.map((r) => r.id));
      return {
        reports,
        pendingLeaveRequests: pending.filter((r) => reportIds.has(r.employeeId)),
      };
    }),
});

// Export helpers so tests can reach them
export { canViewEmployee };
