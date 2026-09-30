import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getEmployees: vi.fn(),
  getEmployeeById: vi.fn(),
  getEmployeeByUserId: vi.fn(),
  getPtoBalances: vi.fn(),
  getLeaveRequests: vi.fn(),
  getLeaveRequestById: vi.fn(),
  createLeaveRequestWithPtoAdjustment: vi.fn(),
  decideLeaveRequestWithPtoAdjustment: vi.fn(),
  createOfferLetter: vi.fn(),
  getOfferLetters: vi.fn(),
  listRecruitingCandidates: vi.fn(),
  createAuditLog: vi.fn(),
}));

import * as db from "../db";
import { executeHr, hrTool } from "./hr";
import type { AIAgentContext } from "../aiAgentService";

const m = vi.mocked(db);
const ctx = (userRole: string, companyId: number | undefined = 1, userId = 10): AIAgentContext => ({ userId, userName: "Jade", userRole, companyId });
const run = (params: Record<string, unknown>, c: AIAgentContext) => executeHr("manage_hr", params, c);

const emp = (patch: Record<string, unknown> = {}) => ({
  id: 1, companyId: 1, userId: 10, employeeNumber: "EMP-1", firstName: "Jade", lastName: "Lee", email: "jade@x.co", phone: null,
  jobTitle: "COO", departmentId: null, managerId: 2, employmentType: "full_time", status: "active", hireDate: new Date("2024-01-01"),
  salary: "150000.00", salaryFrequency: "annual", currency: "USD", bankAccount: "123", taxId: "T1", ...patch,
});
const manager = emp({ id: 2, userId: 20, firstName: "Max", lastName: "Boss", managerId: null });
const other = emp({ id: 3, userId: 30, firstName: "Sam", lastName: "Ops", managerId: 2, jobTitle: "Ops lead", email: "sam@x.co" });

beforeEach(() => {
  vi.clearAllMocks();
  m.getEmployees.mockResolvedValue([emp(), manager, other] as never);
  m.getEmployeeById.mockImplementation(async (id: number) => [emp(), manager, other].find((e) => e.id === id) as never);
  m.getEmployeeByUserId.mockImplementation(async (userId: number) => [emp(), manager, other].find((e) => e.userId === userId) as never);
  m.getPtoBalances.mockResolvedValue([{ leaveType: "vacation", accruedHours: "80", usedHours: "16", pendingHours: "8", carryOverHours: "0" }] as never);
  m.getLeaveRequests.mockResolvedValue([] as never);
  m.createAuditLog.mockResolvedValue(undefined as never);
});

it("declares manage_hr with every action", () => {
  const props = hrTool.function.parameters?.properties as Record<string, { enum?: string[] }>;
  expect(props.action.enum).toEqual(["find_employee", "employee_summary", "request_time_off", "list_time_off", "approve_time_off", "draft_offer_letter", "list_open_positions"]);
});

describe("find_employee", () => {
  it("searches within the company and never returns compensation", async () => {
    const res = await run({ action: "find_employee", query: "sam" }, ctx("user")) as { employees: Array<Record<string, unknown>>; total: number };
    expect(m.getEmployees).toHaveBeenCalledWith({ companyId: 1 });
    expect(res.total).toBe(1);
    expect(res.employees[0]).toMatchObject({ id: 3, name: "Sam Ops" });
    expect(res.employees[0]).not.toHaveProperty("salary");
    expect(res.employees[0]).not.toHaveProperty("bankAccount");
  });

  it("refuses contractors", async () => {
    await expect(run({ action: "find_employee", query: "x" }, ctx("contractor"))).rejects.toThrow(/Not authorized/);
  });
});

describe("employee_summary", () => {
  it("hides another employee's salary from a regular user", async () => {
    const res = await run({ action: "employee_summary", employeeId: 3 }, ctx("user")) as { compensation?: unknown; ptoBalances: Array<{ available: number }> };
    expect(res.compensation).toBeUndefined();
    expect(res.ptoBalances[0].available).toBe(56);
  });

  it("shows salary to admin and to the employee themselves", async () => {
    const asAdmin = await run({ action: "employee_summary", employeeId: 3 }, ctx("admin")) as { compensation?: { salary: number } };
    expect(asAdmin.compensation?.salary).toBe(150000);
    const self = await run({ action: "employee_summary" }, ctx("user")) as { employee: { id: number }; compensation?: { salary: number } };
    expect(self.employee.id).toBe(1);
    expect(self.compensation?.salary).toBe(150000);
  });

  it("treats an employee of another company as not found", async () => {
    m.getEmployeeById.mockResolvedValue(emp({ id: 9, companyId: 2 }) as never);
    await expect(run({ action: "employee_summary", employeeId: 9 }, ctx("admin"))).rejects.toThrow(/Employee not found/);
  });
});

describe("request_time_off", () => {
  it("files for the caller's own record with PTO adjustment", async () => {
    m.createLeaveRequestWithPtoAdjustment.mockResolvedValue({ id: 77 } as never);
    const res = await run({ action: "request_time_off", leaveType: "vacation", startDate: "2026-10-05", endDate: "2026-10-06", reason: "Trip" }, ctx("user")) as { requestId: number; hours: number };
    expect(res).toMatchObject({ requested: true, requestId: 77, employeeId: 1, hours: 16, status: "pending" });
    const [leave, pto] = m.createLeaveRequestWithPtoAdjustment.mock.calls[0];
    expect(leave).toMatchObject({ employeeId: 1, leaveType: "vacation", hours: "16", status: "pending", reason: "Trip" });
    expect(pto).toEqual({ employeeId: 1, leaveType: "vacation", year: 2026, hours: 16 });
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ userId: 10, entityType: "leave_request", entityId: 77, companyId: 1 }));
  });

  it("refuses filing for someone else without an HR role", async () => {
    await expect(run({ action: "request_time_off", employeeId: 3, leaveType: "sick", startDate: "2026-10-05", endDate: "2026-10-05" }, ctx("user"))).rejects.toThrow(/Not authorized/);
    expect(m.createLeaveRequestWithPtoAdjustment).not.toHaveBeenCalled();
  });

  it("lets admin file for another employee", async () => {
    m.createLeaveRequestWithPtoAdjustment.mockResolvedValue({ id: 78 } as never);
    const res = await run({ action: "request_time_off", employeeId: 3, leaveType: "sick", startDate: "2026-10-05", endDate: "2026-10-05", hours: 4 }, ctx("admin")) as { employeeId: number };
    expect(res.employeeId).toBe(3);
    expect(m.createLeaveRequestWithPtoAdjustment.mock.calls[0][0]).toMatchObject({ employeeId: 3, hours: "4" });
  });
});

  it("rejects a weekend-only range instead of charging a day of PTO", async () => {
    await expect(run({ action: "request_time_off", leaveType: "vacation", startDate: "2026-10-03", endDate: "2026-10-04" }, ctx("user"))).rejects.toThrow(/hours|weekday/i);
    expect(m.createLeaveRequestWithPtoAdjustment).not.toHaveBeenCalled();
  });

describe("list_time_off", () => {
  const pending = [
    { id: 1, employeeId: 1, leaveType: "vacation", startDate: new Date(), endDate: new Date(), hours: "8", status: "pending", reason: null },
    { id: 2, employeeId: 3, leaveType: "sick", startDate: new Date(), endDate: new Date(), hours: "8", status: "pending", reason: null },
    { id: 3, employeeId: 99, leaveType: "sick", startDate: new Date(), endDate: new Date(), hours: "8", status: "pending", reason: null },
  ];

  it("shows admins every pending request in the company", async () => {
    m.getLeaveRequests.mockResolvedValue(pending as never);
    const res = await run({ action: "list_time_off" }, ctx("admin")) as { requests: Array<{ id: number; employeeName: string }> };
    expect(m.getLeaveRequests).toHaveBeenCalledWith({ status: "pending" });
    expect(res.requests.map((r) => r.id)).toEqual([1, 2]);
    expect(res.requests[1].employeeName).toBe("Sam Ops");
  });

  it("limits a manager to their own and their reports' requests", async () => {
    m.getLeaveRequests.mockResolvedValue(pending as never);
    const res = await run({ action: "list_time_off" }, ctx("user", 1, 20)) as { requests: Array<{ id: number }> };
    expect(res.requests.map((r) => r.id)).toEqual([1, 2]);
    const asSam = await run({ action: "list_time_off" }, ctx("user", 1, 30)) as { requests: Array<{ id: number }> };
    expect(asSam.requests.map((r) => r.id)).toEqual([2]);
  });
});

describe("approve_time_off", () => {
  const req = { id: 5, employeeId: 3, leaveType: "sick", startDate: new Date("2026-10-05"), endDate: new Date("2026-10-05"), hours: "8.00", status: "pending" };

  it("lets the manager approve with the PTO helper", async () => {
    m.getLeaveRequestById.mockResolvedValue(req as never);
    const res = await run({ action: "approve_time_off", requestId: 5 }, ctx("user", 1, 20)) as { decision: string };
    expect(res.decision).toBe("approved");
    expect(m.decideLeaveRequestWithPtoAdjustment).toHaveBeenCalledWith(5, { status: "approved", approverId: 20, rejectionReason: undefined }, { employeeId: 3, leaveType: "sick", year: 2026, hours: 8, approved: true });
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "approve", entityId: 5 }));
  });

  it("lets exec reject with a reason", async () => {
    m.getLeaveRequestById.mockResolvedValue(req as never);
    await run({ action: "approve_time_off", requestId: 5, decision: "rejected", reason: "Coverage" }, ctx("exec", 1, 50));
    expect(m.decideLeaveRequestWithPtoAdjustment).toHaveBeenCalledWith(5, expect.objectContaining({ status: "rejected", rejectionReason: "Coverage" }), expect.objectContaining({ approved: false }));
  });

  it("refuses a non-manager regular user", async () => {
    m.getLeaveRequestById.mockResolvedValue(req as never);
    await expect(run({ action: "approve_time_off", requestId: 5 }, ctx("user", 1, 10))).rejects.toThrow(/Not authorized/);
    expect(m.decideLeaveRequestWithPtoAdjustment).not.toHaveBeenCalled();
  });

  it("refuses an already decided request", async () => {
    m.getLeaveRequestById.mockResolvedValue({ ...req, status: "approved" } as never);
    await expect(run({ action: "approve_time_off", requestId: 5 }, ctx("admin"))).rejects.toThrow(/already decided/);
  });
});

describe("draft_offer_letter", () => {
  it("creates a draft through createOfferLetter with company + creator stamped", async () => {
    m.createOfferLetter.mockResolvedValue({ id: 12 } as never);
    const res = await run({ action: "draft_offer_letter", candidateName: "Ana Ruiz", position: "Plant Manager", salary: 95000, salaryPeriod: "annual", startDate: "2026-11-01", employmentType: "full_time" }, ctx("admin")) as { offerLetterId: number; status: string };
    expect(res).toMatchObject({ drafted: true, offerLetterId: 12, status: "draft" });
    const data = m.createOfferLetter.mock.calls[0][0];
    expect(data).toMatchObject({ companyId: 1, candidateName: "Ana Ruiz", position: "Plant Manager", salary: "95000.00", salaryPeriod: "annual", status: "draft", createdBy: 10 });
    expect(data.startDate).toEqual(new Date("2026-11-01"));
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "offer_letter", entityId: 12 }));
  });

  it("refuses ops", async () => {
    await expect(run({ action: "draft_offer_letter", candidateName: "A", position: "B" }, ctx("ops"))).rejects.toThrow(/Not authorized/);
    expect(m.createOfferLetter).not.toHaveBeenCalled();
  });
});

describe("list_open_positions", () => {
  it("derives positions from active candidates in the company and open offers", async () => {
    m.listRecruitingCandidates.mockResolvedValue([
      { id: 1, companyId: 1, position: "Plant Manager", stage: "interview" },
      { id: 2, companyId: 1, position: "Plant Manager", stage: "applied" },
      { id: 3, companyId: 1, position: "Sales Rep", stage: "hired" },
      { id: 4, companyId: 2, position: "Sales Rep", stage: "applied" },
    ] as never);
    m.getOfferLetters.mockResolvedValue([{ id: 1, position: "Plant Manager", status: "sent" }, { id: 2, position: "CFO", status: "declined" }] as never);
    const res = await run({ action: "list_open_positions" }, ctx("user")) as { positions: Array<{ position: string; candidates: number; openOffers: number }>; activeCandidates: number };
    expect(m.getOfferLetters).toHaveBeenCalledWith({ companyId: 1 });
    expect(res.activeCandidates).toBe(2);
    expect(res.positions).toEqual([{ position: "Plant Manager", candidates: 2, byStage: { interview: 1, applied: 1 }, openOffers: 1 }]);
  });
});
