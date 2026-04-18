import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxFor(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "emp-user",
    email: "emp@example.com",
    name: "Employee User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("employeePortal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("me", () => {
    it("returns the employee linked to the current user", async () => {
      const caller = appRouter.createCaller(ctxFor());
      vi.spyOn(db, "getEmployeeByUserId").mockResolvedValue({
        id: 7,
        userId: 42,
        firstName: "Ada",
        lastName: "Lovelace",
        departmentId: null,
      } as any);
      vi.spyOn(db, "getDepartments").mockResolvedValue([]);

      const result = await caller.employeePortal.me();
      expect(result?.id).toBe(7);
      expect(result?.firstName).toBe("Ada");
    });

    it("returns null when no employee is linked", async () => {
      const caller = appRouter.createCaller(ctxFor());
      vi.spyOn(db, "getEmployeeByUserId").mockResolvedValue(undefined);

      const result = await caller.employeePortal.me();
      expect(result).toBeNull();
    });
  });

  describe("submitLeaveRequest", () => {
    it("creates a request and bumps pending PTO", async () => {
      const caller = appRouter.createCaller(ctxFor());
      vi.spyOn(db, "getEmployeeByUserId").mockResolvedValue({ id: 7, userId: 42 } as any);
      vi.spyOn(db, "createLeaveRequest").mockResolvedValue({ id: 101 });
      const adjust = vi.spyOn(db, "adjustPtoBalance").mockResolvedValue(undefined);
      vi.spyOn(db, "createAuditLog").mockResolvedValue({ id: 1 });

      const result = await caller.employeePortal.submitLeaveRequest({
        leaveType: "vacation",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2026-06-03"),
        hours: 24,
        reason: "Trip",
      });

      expect(result.id).toBe(101);
      expect(adjust).toHaveBeenCalledWith(7, "vacation", 2026, { pending: 24 });
    });

    it("rejects invalid date ranges", async () => {
      const caller = appRouter.createCaller(ctxFor());
      vi.spyOn(db, "getEmployeeByUserId").mockResolvedValue({ id: 7, userId: 42 } as any);

      await expect(
        caller.employeePortal.submitLeaveRequest({
          leaveType: "vacation",
          startDate: new Date("2026-06-05"),
          endDate: new Date("2026-06-03"),
          hours: 16,
        }),
      ).rejects.toThrow();
    });

    it("throws when no employee record is linked", async () => {
      const caller = appRouter.createCaller(ctxFor());
      vi.spyOn(db, "getEmployeeByUserId").mockResolvedValue(undefined);

      await expect(
        caller.employeePortal.submitLeaveRequest({
          leaveType: "sick",
          startDate: new Date(),
          endDate: new Date(),
          hours: 4,
        }),
      ).rejects.toThrow(/No employee record/);
    });
  });

  describe("cancelLeaveRequest", () => {
    it("only allows cancelling your own request", async () => {
      const caller = appRouter.createCaller(ctxFor());
      vi.spyOn(db, "getEmployeeByUserId").mockResolvedValue({ id: 7, userId: 42 } as any);
      vi.spyOn(db, "getLeaveRequestById").mockResolvedValue({
        id: 101,
        employeeId: 999,
        leaveType: "vacation",
        startDate: new Date("2026-06-01"),
        hours: "8",
        status: "pending",
      } as any);

      await expect(
        caller.employeePortal.cancelLeaveRequest({ id: 101 }),
      ).rejects.toThrow(/Not your request/);
    });

    it("refunds pending hours when cancelling a pending request", async () => {
      const caller = appRouter.createCaller(ctxFor());
      vi.spyOn(db, "getEmployeeByUserId").mockResolvedValue({ id: 7, userId: 42 } as any);
      vi.spyOn(db, "getLeaveRequestById").mockResolvedValue({
        id: 101,
        employeeId: 7,
        leaveType: "vacation",
        startDate: new Date("2026-06-01"),
        hours: "8",
        status: "pending",
      } as any);
      vi.spyOn(db, "updateLeaveRequest").mockResolvedValue(undefined);
      const adjust = vi.spyOn(db, "adjustPtoBalance").mockResolvedValue(undefined);
      vi.spyOn(db, "createAuditLog").mockResolvedValue({ id: 1 });

      await caller.employeePortal.cancelLeaveRequest({ id: 101 });
      expect(adjust).toHaveBeenCalledWith(7, "vacation", 2026, { pending: -8 });
    });
  });

  describe("decideLeaveRequest", () => {
    it("allows the employee's manager to approve", async () => {
      const caller = appRouter.createCaller(ctxFor({ id: 10, role: "user" }));
      vi.spyOn(db, "getLeaveRequestById").mockResolvedValue({
        id: 101,
        employeeId: 7,
        leaveType: "vacation",
        startDate: new Date("2026-06-01"),
        hours: "16",
        status: "pending",
      } as any);
      vi.spyOn(db, "getEmployeeById").mockResolvedValue({ id: 7, managerId: 10 } as any);
      vi.spyOn(db, "updateLeaveRequest").mockResolvedValue(undefined);
      const adjust = vi.spyOn(db, "adjustPtoBalance").mockResolvedValue(undefined);
      vi.spyOn(db, "createAuditLog").mockResolvedValue({ id: 1 });

      const result = await caller.employeePortal.decideLeaveRequest({
        id: 101,
        decision: "approved",
      });
      expect(result.success).toBe(true);
      expect(adjust).toHaveBeenCalledWith(7, "vacation", 2026, { pending: -16, used: 16 });
    });

    it("rejects non-managers, non-admins", async () => {
      const caller = appRouter.createCaller(ctxFor({ id: 999, role: "user" }));
      vi.spyOn(db, "getLeaveRequestById").mockResolvedValue({
        id: 101,
        employeeId: 7,
        leaveType: "vacation",
        startDate: new Date("2026-06-01"),
        hours: "16",
        status: "pending",
      } as any);
      vi.spyOn(db, "getEmployeeById").mockResolvedValue({ id: 7, managerId: 10 } as any);

      await expect(
        caller.employeePortal.decideLeaveRequest({ id: 101, decision: "approved" }),
      ).rejects.toThrow();
    });
  });

  describe("onboarding", () => {
    it("marks a task completed", async () => {
      const caller = appRouter.createCaller(ctxFor());
      vi.spyOn(db, "getEmployeeByUserId").mockResolvedValue({ id: 7, userId: 42 } as any);
      vi.spyOn(db, "getOnboardingTasks").mockResolvedValue([
        { id: 1, employeeId: 7, title: "Sign handbook", status: "pending" } as any,
      ]);
      const update = vi.spyOn(db, "updateOnboardingTask").mockResolvedValue(undefined);

      await caller.employeePortal.updateOnboardingTask({ id: 1, status: "completed" });
      expect(update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: "completed", completedAt: expect.any(Date) }),
      );
    });

    it("prevents editing another employee's task", async () => {
      const caller = appRouter.createCaller(ctxFor());
      vi.spyOn(db, "getEmployeeByUserId").mockResolvedValue({ id: 7, userId: 42 } as any);
      vi.spyOn(db, "getOnboardingTasks").mockResolvedValue([
        { id: 1, employeeId: 7, title: "Sign handbook", status: "pending" } as any,
      ]);

      await expect(
        caller.employeePortal.updateOnboardingTask({ id: 999, status: "completed" }),
      ).rejects.toThrow(/Not your task/);
    });
  });
});
