/**
 * manage_hr — AI Assistant chat tool for People / HR.
 *
 * Reads: any internal role, but salary / bank / tax fields are only returned
 * to admin, exec (or a future "hr" role). Time-off requests default to the
 * caller's own employee record; only admin/hr may file for someone else.
 * Approvals mirror employeePortal.decideLeaveRequest (manager or admin/exec).
 * Offer letters are created as drafts through the same helper offerLetters.create
 * uses and are never sent from here.
 */
import * as db from "../db";
import type { Employee } from "../../drizzle/schema";
import {
  type ChatToolModule,
  type ChatToolParams,
  type AIAgentContext,
  HR_ROLES,
  ChatToolError,
  defineTool,
  hasRole,
  requireInternal,
  requireRole,
  companyIdOf,
  inCompany,
  notFound,
  requireNumber,
  requireString,
  requireDate,
  optionalNumber,
  optionalString,
  optionalDate,
  toNumber,
  countBy,
  includesText,
  unknownAction,
} from "./types";

export const HR_ACTIONS = [
  "find_employee",
  "employee_summary",
  "request_time_off",
  "list_time_off",
  "approve_time_off",
  "draft_offer_letter",
  "list_open_positions",
] as const;

const LEAVE_TYPES = ["vacation", "sick", "personal", "parental", "bereavement", "unpaid", "other"] as const;
type LeaveType = (typeof LEAVE_TYPES)[number];
const SALARY_PERIODS = ["annual", "monthly", "hourly"] as const;
const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern"] as const;
// Candidates in these stages still count toward an open position.
const OPEN_CANDIDATE_STAGES = new Set(["applied", "screening", "interview", "assessment", "offer"]);

export const hrTool = defineTool(
  "manage_hr",
  "HR module: find employees, get an employee summary (PTO balances, pending leave), file or list or approve time-off requests, draft an offer letter (draft only, never sent) and list open positions from the recruiting pipeline.",
  HR_ACTIONS,
  {
    query: { type: "string", description: "Name, email or job title to search (find_employee)" },
    employeeId: { type: "number", description: "Employee ID (employee_summary; request_time_off on behalf of someone, admin/HR only)" },
    leaveType: { type: "string", enum: [...LEAVE_TYPES], description: "Type of leave (request_time_off)" },
    startDate: { type: "string", description: "ISO date (request_time_off, draft_offer_letter start date)" },
    endDate: { type: "string", description: "ISO date (request_time_off)" },
    hours: { type: "number", description: "Hours requested; defaults to 8 per weekday in the range (request_time_off)" },
    reason: { type: "string", description: "Reason for the request, or rejection reason (approve_time_off)" },
    status: { type: "string", enum: ["pending", "approved", "rejected", "cancelled"], description: "Filter (list_time_off), default pending" },
    requestId: { type: "number", description: "Leave request ID (approve_time_off)" },
    decision: { type: "string", enum: ["approved", "rejected"], description: "Decision (approve_time_off), default approved" },
    candidateName: { type: "string", description: "Candidate full name (draft_offer_letter)" },
    candidateEmail: { type: "string", description: "Candidate email (draft_offer_letter)" },
    position: { type: "string", description: "Job title (draft_offer_letter)" },
    department: { type: "string", description: "Department (draft_offer_letter)" },
    salary: { type: "number", description: "Offered salary (draft_offer_letter)" },
    salaryPeriod: { type: "string", enum: [...SALARY_PERIODS], description: "Salary period (draft_offer_letter)" },
    employmentType: { type: "string", enum: [...EMPLOYMENT_TYPES], description: "Employment type (draft_offer_letter)" },
    reportingTo: { type: "string", description: "Manager name (draft_offer_letter)" },
    location: { type: "string", description: "Work location (draft_offer_letter)" },
    notes: { type: "string", description: "Internal notes (draft_offer_letter)" },
  },
);

function canSeeCompensation(ctx: AIAgentContext): boolean {
  return hasRole(ctx, HR_ROLES);
}

function publicEmployee(e: Employee) {
  return {
    id: e.id,
    employeeNumber: e.employeeNumber,
    name: `${e.firstName} ${e.lastName}`.trim(),
    email: e.email,
    phone: e.phone,
    jobTitle: e.jobTitle,
    departmentId: e.departmentId,
    managerId: e.managerId,
    employmentType: e.employmentType,
    status: e.status,
    hireDate: e.hireDate,
    userId: e.userId,
  };
}

function compensationOf(e: Employee) {
  return { salary: toNumber(e.salary), salaryFrequency: e.salaryFrequency, currency: e.currency };
}

async function loadEmployee(ctx: AIAgentContext, id: number): Promise<Employee> {
  const e = await db.getEmployeeById(id);
  if (!e || !inCompany(ctx, e.companyId)) return notFound("Employee");
  return e;
}

async function findEmployee(params: ChatToolParams, ctx: AIAgentContext) {
  const query = requireString(params.query, "query");
  const rows = await db.getEmployees({ companyId: companyIdOf(ctx) });
  const matches = rows.filter((e) => includesText([e.firstName, e.lastName, `${e.firstName} ${e.lastName}`, e.email, e.jobTitle, e.employeeNumber], query));
  return { employees: matches.slice(0, 25).map(publicEmployee), total: matches.length, query };
}

async function employeeSummary(params: ChatToolParams, ctx: AIAgentContext) {
  let employee: Employee;
  const employeeId = optionalNumber(params.employeeId);
  if (employeeId != null) {
    employee = await loadEmployee(ctx, employeeId);
  } else {
    const own = await db.getEmployeeByUserId(ctx.userId);
    if (!own) throw new ChatToolError("No employee record is linked to your user. Pass employeeId or contact HR.");
    employee = own;
  }
  const isSelf = employee.userId === ctx.userId;
  const [pto, leave] = await Promise.all([
    db.getPtoBalances(employee.id, new Date().getFullYear()),
    db.getLeaveRequests({ employeeId: employee.id }),
  ]);
  const manager = employee.managerId ? await db.getEmployeeById(employee.managerId) : undefined;
  return {
    employee: publicEmployee(employee),
    manager: manager ? { id: manager.id, name: `${manager.firstName} ${manager.lastName}`.trim() } : null,
    // Own compensation is always visible; anyone else's needs an HR-level role.
    compensation: isSelf || canSeeCompensation(ctx) ? compensationOf(employee) : undefined,
    ptoBalances: pto.map((b) => ({
      leaveType: b.leaveType,
      accrued: toNumber(b.accruedHours),
      used: toNumber(b.usedHours),
      pending: toNumber(b.pendingHours),
      carryOver: toNumber(b.carryOverHours),
      available: toNumber(b.accruedHours) + toNumber(b.carryOverHours) - toNumber(b.usedHours) - toNumber(b.pendingHours),
    })),
    leaveRequests: {
      pending: leave.filter((r) => r.status === "pending").length,
      approved: leave.filter((r) => r.status === "approved").length,
      recent: leave.slice(0, 5).map(compactLeave),
    },
  };
}

function compactLeave(r: Awaited<ReturnType<typeof db.getLeaveRequests>>[number]) {
  return { id: r.id, employeeId: r.employeeId, leaveType: r.leaveType, startDate: r.startDate, endDate: r.endDate, hours: toNumber(r.hours), status: r.status, reason: r.reason };
}

function weekdayHours(start: Date, end: Date): number {
  let days = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getTime() <= last.getTime()) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(days, 1) * 8;
}

async function requestTimeOff(params: ChatToolParams, ctx: AIAgentContext) {
  const leaveType = requireString(params.leaveType, "leaveType") as LeaveType;
  if (!LEAVE_TYPES.includes(leaveType)) throw new ChatToolError(`Unknown leaveType: ${leaveType}`);
  const startDate = requireDate(params.startDate, "startDate");
  const endDate = requireDate(params.endDate, "endDate");
  if (endDate < startDate) throw new ChatToolError("End date is before start date");

  const own = await db.getEmployeeByUserId(ctx.userId);
  const targetId = optionalNumber(params.employeeId);
  let employee: Employee;
  if (targetId != null && targetId !== own?.id) {
    requireRole(ctx, HR_ROLES, "request time off for another employee");
    employee = await loadEmployee(ctx, targetId);
  } else {
    if (!own) throw new ChatToolError("No employee record is linked to your user. Contact HR.");
    employee = own;
  }

  const hours = optionalNumber(params.hours) ?? weekdayHours(startDate, endDate);
  if (hours <= 0) throw new ChatToolError("hours must be greater than zero");
  // Same helper as employeePortal.submitLeaveRequest so PTO pending hours stay in sync.
  const result = await db.createLeaveRequestWithPtoAdjustment(
    {
      employeeId: employee.id,
      leaveType,
      startDate,
      endDate,
      hours: hours.toString(),
      reason: optionalString(params.reason),
      status: "pending",
    },
    { employeeId: employee.id, leaveType, year: startDate.getFullYear(), hours },
  );
  await db.createAuditLog({
    companyId: employee.companyId ?? companyIdOf(ctx),
    userId: ctx.userId,
    action: "create",
    entityType: "leave_request",
    entityId: result.id,
    newValues: { employeeId: employee.id, leaveType, hours, via: "ai_chat" },
  });
  return { requested: true, requestId: result.id, employeeId: employee.id, leaveType, startDate, endDate, hours, status: "pending" };
}

async function listTimeOff(params: ChatToolParams, ctx: AIAgentContext) {
  const status = optionalString(params.status) ?? "pending";
  const [requests, employees] = await Promise.all([
    db.getLeaveRequests({ status }),
    db.getEmployees({ companyId: companyIdOf(ctx) }),
  ]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  let visible = requests.filter((r) => byId.has(r.employeeId));
  if (!hasRole(ctx, HR_ROLES)) {
    // Non-approvers see their own requests plus their direct reports'.
    const own = employees.find((e) => e.userId === ctx.userId);
    const reportIds = new Set(employees.filter((e) => own && e.managerId === own.id).map((e) => e.id));
    visible = visible.filter((r) => (own && r.employeeId === own.id) || reportIds.has(r.employeeId));
  }
  return {
    status,
    total: visible.length,
    requests: visible.slice(0, 50).map((r) => {
      const e = byId.get(r.employeeId);
      return { ...compactLeave(r), employeeName: e ? `${e.firstName} ${e.lastName}`.trim() : null };
    }),
  };
}

async function approveTimeOff(params: ChatToolParams, ctx: AIAgentContext) {
  requireInternal(ctx, "approve time off");
  const requestId = requireNumber(params.requestId, "requestId");
  const decision = (optionalString(params.decision) ?? "approved") as "approved" | "rejected";
  if (decision !== "approved" && decision !== "rejected") throw new ChatToolError("decision must be approved or rejected");

  const req = await db.getLeaveRequestById(requestId);
  if (!req) return notFound("Leave request");
  const target = await loadEmployee(ctx, req.employeeId);
  const acting = await db.getEmployeeByUserId(ctx.userId);
  const isManager = acting != null && target.managerId != null && target.managerId === acting.id;
  if (!isManager && !hasRole(ctx, HR_ROLES)) {
    throw new ChatToolError(`Not authorized: "approve time off" requires the employee's manager or an admin/HR/exec role.`);
  }
  if (req.status !== "pending") throw new ChatToolError("Request already decided");

  const hours = toNumber(req.hours);
  await db.decideLeaveRequestWithPtoAdjustment(
    requestId,
    { status: decision, approverId: ctx.userId, rejectionReason: optionalString(params.reason) },
    { employeeId: req.employeeId, leaveType: req.leaveType, year: new Date(req.startDate).getFullYear(), hours, approved: decision === "approved" },
  );
  await db.createAuditLog({
    companyId: target.companyId ?? companyIdOf(ctx),
    userId: ctx.userId,
    action: decision === "approved" ? "approve" : "reject",
    entityType: "leave_request",
    entityId: requestId,
    newValues: { decision, via: "ai_chat" },
  });
  return { decided: true, requestId, decision, employeeId: req.employeeId, hours };
}

async function draftOfferLetter(params: ChatToolParams, ctx: AIAgentContext) {
  requireRole(ctx, HR_ROLES, "draft offer letter");
  const candidateName = requireString(params.candidateName, "candidateName");
  const position = requireString(params.position, "position");
  const salaryPeriod = optionalString(params.salaryPeriod) as (typeof SALARY_PERIODS)[number] | undefined;
  if (salaryPeriod && !SALARY_PERIODS.includes(salaryPeriod)) throw new ChatToolError(`Unknown salaryPeriod: ${salaryPeriod}`);
  const employmentType = optionalString(params.employmentType) as (typeof EMPLOYMENT_TYPES)[number] | undefined;
  if (employmentType && !EMPLOYMENT_TYPES.includes(employmentType)) throw new ChatToolError(`Unknown employmentType: ${employmentType}`);
  const salary = optionalNumber(params.salary);
  const companyId = companyIdOf(ctx);

  // Same helper as offerLetters.create; status pinned to draft (sending is offerLetters.send).
  const result = await db.createOfferLetter({
    companyId,
    candidateName,
    candidateEmail: optionalString(params.candidateEmail),
    position,
    department: optionalString(params.department),
    startDate: optionalDate(params.startDate, "startDate"),
    salary: salary != null ? salary.toFixed(2) : undefined,
    salaryPeriod,
    employmentType,
    reportingTo: optionalString(params.reportingTo),
    location: optionalString(params.location),
    notes: optionalString(params.notes),
    status: "draft",
    createdBy: ctx.userId,
  });
  await db.createAuditLog({
    companyId,
    userId: ctx.userId,
    action: "create",
    entityType: "offer_letter",
    entityId: result.id,
    entityName: candidateName,
    newValues: { position, status: "draft", via: "ai_chat" },
  });
  return { drafted: true, offerLetterId: result.id, candidateName, position, status: "draft" };
}

async function listOpenPositions(ctx: AIAgentContext) {
  const [candidates, offers] = await Promise.all([
    db.listRecruitingCandidates(),
    db.getOfferLetters({ companyId: companyIdOf(ctx) }),
  ]);
  const active = candidates.filter((c) => inCompany(ctx, c.companyId) && OPEN_CANDIDATE_STAGES.has(c.stage));
  const positions = new Map<string, { position: string; candidates: number; byStage: Record<string, number>; openOffers: number }>();
  for (const c of active) {
    const key = (c.position ?? "Unspecified").trim() || "Unspecified";
    const entry = positions.get(key) ?? { position: key, candidates: 0, byStage: {}, openOffers: 0 };
    entry.candidates += 1;
    entry.byStage[c.stage] = (entry.byStage[c.stage] ?? 0) + 1;
    positions.set(key, entry);
  }
  for (const o of offers) {
    if (o.status !== "draft" && o.status !== "sent" && o.status !== "viewed") continue;
    const key = (o.position ?? "Unspecified").trim() || "Unspecified";
    const entry = positions.get(key) ?? { position: key, candidates: 0, byStage: {}, openOffers: 0 };
    entry.openOffers += 1;
    positions.set(key, entry);
  }
  return {
    positions: Array.from(positions.values()).sort((a, b) => b.candidates - a.candidates),
    activeCandidates: active.length,
    candidatesByStage: countBy(active, (c) => c.stage),
    note: "Positions are derived from active recruiting candidates and open offer letters; there is no separate requisition table.",
  };
}

export async function executeHr(name: string, params: ChatToolParams, ctx: AIAgentContext): Promise<unknown> {
  if (name !== "manage_hr") throw new ChatToolError(`Unknown tool: ${name}`);
  requireInternal(ctx, "use HR tools");
  switch (params.action) {
    case "find_employee": return findEmployee(params, ctx);
    case "employee_summary": return employeeSummary(params, ctx);
    case "request_time_off": return requestTimeOff(params, ctx);
    case "list_time_off": return listTimeOff(params, ctx);
    case "approve_time_off": return approveTimeOff(params, ctx);
    case "draft_offer_letter": return draftOfferLetter(params, ctx);
    case "list_open_positions": return listOpenPositions(ctx);
    default: return unknownAction("manage_hr", params.action);
  }
}

export const hrModule: ChatToolModule = {
  name: "hr",
  tools: [hrTool],
  execute: executeHr,
};
