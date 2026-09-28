/**
 * Linking a login (users row) to an employee record (employees.userId).
 *
 * The employee portal resolves "who am I" through employees.userId, so this is
 * the only place that sets or clears it. Used by the employees router
 * (linkUser / unlinkUser / linkCandidates), by teamInvites.invite (validating an
 * invite sent for an employee) and by the signup handler in _core/localAuth.ts
 * (auto-link on invite acceptance).
 *
 * Rules:
 * - one login per employee and one employee per login;
 * - re-linking the same pair is a no-op;
 * - a different existing link is a CONFLICT (unlink first);
 * - rows outside the caller's entity scope read as NOT_FOUND.
 */
import * as db from "./db";
import { scopeAllows, type Scope } from "./_core/scope";
import { createLogger } from "./_core/logger";
import type { Employee, User } from "../drizzle/schema";

const log = createLogger("EmployeeLink");

/** Portal-only roles; never offered as an employee's login. Mirrors EXTERNAL_ROLES in routers/_shared.ts. */
export const EXTERNAL_USER_ROLES: readonly string[] = ["copacker", "vendor", "investor", "contractor"];

export type LinkFailure = { ok: false; code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST"; message: string };

type EmployeeEmails = Pick<Employee, "email" | "personalEmail">;
type CandidateUser = Pick<User, "id" | "name" | "email" | "role" | "companyId" | "isActive">;

export interface LinkCandidate {
  id: number;
  name: string | null;
  email: string | null;
  role: User["role"];
  match: "email" | "company";
}

export type LinkedUser = Pick<User, "id" | "name" | "email" | "role">;

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

export function employeeFullName(e: Pick<Employee, "firstName" | "lastName">): string {
  return `${e.firstName} ${e.lastName}`.trim();
}

/** True when `email` equals the employee's work or personal email (case-insensitive). */
export function emailMatchesEmployee(employee: EmployeeEmails, email: string | null | undefined): boolean {
  const e = norm(email);
  return e !== "" && (e === norm(employee.email) || e === norm(employee.personalEmail));
}

/** Employees are fenced by their companyId; with no scope (system callers) everything is visible. */
function employeeVisible(scope: Scope | undefined, employee: Pick<Employee, "companyId">): boolean {
  return !scope || scopeAllows(scope, employee.companyId);
}

/** A user with no home company is not in anyone else's entity, so a scoped admin may still see it. */
function userVisible(scope: Scope | undefined, user: Pick<User, "companyId">): boolean {
  return !scope || user.companyId == null || scopeAllows(scope, user.companyId);
}

/**
 * Pure ranking for employees.linkCandidates: users whose email matches the
 * employee's work/personal email first, then unlinked users in the same
 * company (or with no company). External roles, inactive users and users
 * already linked to an employee are left out.
 */
export function rankLinkCandidates(
  employee: Pick<Employee, "email" | "personalEmail" | "companyId">,
  users: CandidateUser[],
  linkedUserIds: ReadonlySet<number>,
  isVisible: (u: CandidateUser) => boolean = () => true,
): LinkCandidate[] {
  const out: LinkCandidate[] = [];
  for (const u of users) {
    if (EXTERNAL_USER_ROLES.includes(u.role)) continue;
    if (u.isActive === false) continue;
    if (linkedUserIds.has(u.id)) continue;
    if (!isVisible(u)) continue;
    if (emailMatchesEmployee(employee, u.email)) {
      out.push({ id: u.id, name: u.name, email: u.email, role: u.role, match: "email" });
    } else if (u.companyId == null || u.companyId === employee.companyId) {
      out.push({ id: u.id, name: u.name, email: u.email, role: u.role, match: "company" });
    }
  }
  const label = (c: LinkCandidate) => norm(c.name || c.email);
  return out.sort((a, b) =>
    a.match !== b.match ? (a.match === "email" ? -1 : 1) : label(a).localeCompare(label(b)) || a.id - b.id);
}

export async function getVisibleEmployee(employeeId: number, scope?: Scope): Promise<Employee | undefined> {
  const employee = await db.getEmployeeById(employeeId);
  return employee && employeeVisible(scope, employee) ? employee : undefined;
}

export async function getLinkCandidates(employeeId: number, scope?: Scope): Promise<LinkCandidate[] | LinkFailure> {
  const employee = await getVisibleEmployee(employeeId, scope);
  if (!employee) return { ok: false, code: "NOT_FOUND", message: "Employee not found" };
  const [users, allEmployees] = await Promise.all([db.getAllUsers(), db.getEmployees()]);
  const linked = new Set<number>();
  for (const e of allEmployees) if (e.userId != null) linked.add(e.userId);
  return rankLinkCandidates(employee, users, linked, (u) => userVisible(scope, u));
}

/** The login currently linked to the employee (null when unlinked or the user row is gone). */
export async function getLinkedUser(employeeId: number, scope?: Scope): Promise<LinkedUser | null | LinkFailure> {
  const employee = await getVisibleEmployee(employeeId, scope);
  if (!employee) return { ok: false, code: "NOT_FOUND", message: "Employee not found" };
  if (employee.userId == null) return null;
  const user = await db.getUserById(employee.userId);
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function linkEmployeeToUser(args: {
  employeeId: number;
  userId: number;
  actorUserId: number;
  scope?: Scope;
}): Promise<{ ok: true; changed: boolean; employeeId: number; userId: number } | LinkFailure> {
  const { employeeId, userId, actorUserId, scope } = args;
  const employee = await getVisibleEmployee(employeeId, scope);
  if (!employee) return { ok: false, code: "NOT_FOUND", message: "Employee not found" };
  const user = await db.getUserById(userId);
  if (!user || !userVisible(scope, user)) return { ok: false, code: "NOT_FOUND", message: "User not found" };

  if (employee.userId === userId) return { ok: true, changed: false, employeeId, userId };
  if (employee.userId != null) {
    return { ok: false, code: "CONFLICT", message: "This employee is already linked to a different login. Unlink it first." };
  }
  const other = await db.getEmployeeByUserId(userId);
  if (other && other.id !== employeeId) {
    return {
      ok: false,
      code: "CONFLICT",
      message: `That login is already linked to ${employeeFullName(other)}. Unlink it there first.`,
    };
  }

  const written = await db.setEmployeeUserIdIfUnlinked(employeeId, userId);
  if (!written) {
    // Lost a race: someone linked the row between our read and the write.
    const now = await db.getEmployeeById(employeeId);
    if (now?.userId === userId) return { ok: true, changed: false, employeeId, userId };
    return { ok: false, code: "CONFLICT", message: "This employee was just linked to a different login." };
  }

  await db.createAuditLog({
    userId: actorUserId,
    action: "update",
    entityType: "employee",
    entityId: employeeId,
    entityName: employeeFullName(employee),
    oldValues: { userId: null },
    newValues: { userId },
  });
  return { ok: true, changed: true, employeeId, userId };
}

export async function unlinkEmployeeFromUser(args: {
  employeeId: number;
  actorUserId: number;
  scope?: Scope;
}): Promise<{ ok: true; changed: boolean } | LinkFailure> {
  const employee = await getVisibleEmployee(args.employeeId, args.scope);
  if (!employee) return { ok: false, code: "NOT_FOUND", message: "Employee not found" };
  if (employee.userId == null) return { ok: true, changed: false };

  await db.clearEmployeeUserId(employee.id);
  await db.createAuditLog({
    userId: args.actorUserId,
    action: "update",
    entityType: "employee",
    entityId: employee.id,
    entityName: employeeFullName(employee),
    oldValues: { userId: employee.userId },
    newValues: { userId: null },
  });
  return { ok: true, changed: true };
}

/**
 * Validate an invite sent "for" an employee. team_invites has no column to
 * carry the employee id, so the link is made at signup by matching the invite
 * email — which therefore must identify exactly this (unlinked) employee.
 */
export async function checkEmployeeInvite(
  employeeId: number,
  inviteEmail: string,
  scope?: Scope,
): Promise<{ ok: true; employee: Employee } | LinkFailure> {
  const employee = await getVisibleEmployee(employeeId, scope);
  if (!employee) return { ok: false, code: "NOT_FOUND", message: "Employee not found" };
  if (employee.userId != null) {
    return { ok: false, code: "CONFLICT", message: "This employee already has a linked login." };
  }
  if (!emailMatchesEmployee(employee, inviteEmail)) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "The invite email must be the employee's work or personal email so the new account can be linked on signup.",
    };
  }
  const sameEmail = (await db.getEmployeesByEmail(inviteEmail)).filter((e) => e.userId == null && e.id !== employeeId);
  if (sameEmail.length > 0) {
    return {
      ok: false,
      code: "CONFLICT",
      message: `Another unlinked employee (${employeeFullName(sameEmail[0])}) has this email, so signup could not tell them apart.`,
    };
  }
  return { ok: true, employee };
}

/**
 * Signup-with-invite hook: link the new login to the one unlinked employee
 * whose work/personal email equals the invite email. Never throws — a link
 * problem must not fail the signup; it is logged and left for HR to fix.
 */
export async function linkEmployeeForAcceptedInvite(
  inviteEmail: string,
  userId: number,
): Promise<{ linked: true; employeeId: number } | { linked: false; reason: string }> {
  try {
    const matches = await db.getEmployeesByEmail(inviteEmail);
    const already = matches.find((e) => e.userId === userId);
    if (already) return { linked: true, employeeId: already.id };
    const unlinked = matches.filter((e) => e.userId == null);
    if (unlinked.length === 0) return { linked: false, reason: "no unlinked employee with this email" };
    if (unlinked.length > 1) {
      log.warn("Several unlinked employees share the invite email; not auto-linking", { userId, count: unlinked.length });
      return { linked: false, reason: "ambiguous" };
    }
    const result = await linkEmployeeToUser({ employeeId: unlinked[0].id, userId, actorUserId: userId });
    if (result.ok === false) {
      log.warn("Could not link new login to employee", { userId, employeeId: unlinked[0].id, reason: result.message });
      return { linked: false, reason: result.message };
    }
    return { linked: true, employeeId: unlinked[0].id };
  } catch (err) {
    log.warn("Failed to link employee on invite accept", { userId, error: err instanceof Error ? err.message : String(err) });
    return { linked: false, reason: "error" };
  }
}
