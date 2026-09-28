import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getEmployeeById: vi.fn(),
  getEmployeeByUserId: vi.fn(),
  getEmployees: vi.fn(),
  getEmployeesByEmail: vi.fn(),
  setEmployeeUserIdIfUnlinked: vi.fn(),
  clearEmployeeUserId: vi.fn(),
  getUserById: vi.fn(),
  getAllUsers: vi.fn(),
  createAuditLog: vi.fn(),
  createTeamInvite: vi.fn(),
  getUserEntityAccessCompanyIds: vi.fn(),
  getCompanyById: vi.fn(),
  getCompanyIdsInRegion: vi.fn(),
  getEntityAndDescendantCompanyIds: vi.fn(),
}));

vi.mock("./_core/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  isEmailConfigured: vi.fn().mockReturnValue(true),
}));

import * as db from "./db";
import { appRouter } from "./routers/index";
import { linkEmployeeForAcceptedInvite, rankLinkCandidates } from "./employeeLinkService";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function callerFor(role: AuthenticatedUser["role"], overrides: Partial<AuthenticatedUser> = {}) {
  const user = {
    id: 1,
    openId: `u-${role}`,
    email: `${role}@example.com`,
    name: `${role} user`,
    loginMethod: "email",
    role,
    companyId: 1,
    regionScope: "global",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  } as AuthenticatedUser;
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

type EmployeeRow = NonNullable<Awaited<ReturnType<typeof db.getEmployeeById>>>;
type UserRow = NonNullable<Awaited<ReturnType<typeof db.getUserById>>>;

const emp = (o: Partial<EmployeeRow> = {}) =>
  ({ id: 10, companyId: 1, userId: null, firstName: "Dana", lastName: "Employee", email: "dana@example.com", personalEmail: null, ...o }) as EmployeeRow;
const usr = (o: Partial<UserRow> = {}) =>
  ({ id: 42, name: "Dana", email: "dana@example.com", role: "user", companyId: 1, isActive: true, ...o }) as UserRow;

const admin = callerFor("admin");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getUserEntityAccessCompanyIds).mockResolvedValue([]);
  vi.mocked(db.getEmployeeById).mockResolvedValue(emp());
  vi.mocked(db.getUserById).mockResolvedValue(usr());
  vi.mocked(db.getEmployeeByUserId).mockResolvedValue(undefined);
  vi.mocked(db.setEmployeeUserIdIfUnlinked).mockResolvedValue(true);
  vi.mocked(db.getEmployeesByEmail).mockResolvedValue([]);
});

describe("employees.linkUser", () => {
  it("links an unlinked employee to a free user and writes an audit row", async () => {
    await expect(admin.employees.linkUser({ employeeId: 10, userId: 42 })).resolves.toEqual({ success: true, changed: true });
    expect(db.setEmployeeUserIdIfUnlinked).toHaveBeenCalledWith(10, 42);
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1, action: "update", entityType: "employee", entityId: 10, entityName: "Dana Employee",
      oldValues: { userId: null }, newValues: { userId: 42 },
    }));
  });

  it("re-linking the same pair is a no-op (no write, no audit)", async () => {
    vi.mocked(db.getEmployeeById).mockResolvedValue(emp({ userId: 42 }));
    vi.mocked(db.getEmployeeByUserId).mockResolvedValue(emp({ userId: 42 }));
    await expect(admin.employees.linkUser({ employeeId: 10, userId: 42 })).resolves.toEqual({ success: true, changed: false });
    expect(db.setEmployeeUserIdIfUnlinked).not.toHaveBeenCalled();
    expect(db.createAuditLog).not.toHaveBeenCalled();
  });

  it("NOT_FOUND for a missing employee or user", async () => {
    vi.mocked(db.getEmployeeById).mockResolvedValueOnce(undefined);
    await expect(admin.employees.linkUser({ employeeId: 99, userId: 42 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Employee not found" });
    vi.mocked(db.getUserById).mockResolvedValueOnce(undefined);
    await expect(admin.employees.linkUser({ employeeId: 10, userId: 99 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "User not found" });
    expect(db.setEmployeeUserIdIfUnlinked).not.toHaveBeenCalled();
  });

  it("CONFLICT when the employee already has a different login", async () => {
    vi.mocked(db.getEmployeeById).mockResolvedValue(emp({ userId: 43 }));
    await expect(admin.employees.linkUser({ employeeId: 10, userId: 42 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.setEmployeeUserIdIfUnlinked).not.toHaveBeenCalled();
  });

  it("CONFLICT when the user is already linked to another employee", async () => {
    vi.mocked(db.getEmployeeByUserId).mockResolvedValue(emp({ id: 11, firstName: "Morgan", lastName: "Manager", userId: 42 }));
    await expect(admin.employees.linkUser({ employeeId: 10, userId: 42 })).rejects.toMatchObject({
      code: "CONFLICT", message: expect.stringContaining("Morgan Manager"),
    });
    expect(db.setEmployeeUserIdIfUnlinked).not.toHaveBeenCalled();
  });

  it("CONFLICT when a concurrent link wins the conditional write", async () => {
    vi.mocked(db.setEmployeeUserIdIfUnlinked).mockResolvedValue(false);
    vi.mocked(db.getEmployeeById).mockResolvedValueOnce(emp()).mockResolvedValueOnce(emp({ userId: 43 }));
    await expect(admin.employees.linkUser({ employeeId: 10, userId: 42 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.createAuditLog).not.toHaveBeenCalled();
  });

  it("an employee outside an entity-scoped admin's companies reads as NOT_FOUND", async () => {
    const scoped = callerFor("admin", { regionScope: "entity", companyId: 2 });
    vi.mocked(db.getUserEntityAccessCompanyIds).mockResolvedValue([2]);
    vi.mocked(db.getEntityAndDescendantCompanyIds).mockResolvedValue([2]);
    await expect(scoped.employees.linkUser({ employeeId: 10, userId: 42 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // A user homed in another entity is out of scope too.
    vi.mocked(db.getEmployeeById).mockResolvedValue(emp({ companyId: 2 }));
    await expect(scoped.employees.linkUser({ employeeId: 10, userId: 42 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "User not found" });
    vi.mocked(db.getUserById).mockResolvedValue(usr({ companyId: 2 }));
    await expect(scoped.employees.linkUser({ employeeId: 10, userId: 42 })).resolves.toEqual({ success: true, changed: true });
  });

  it("is admin-only", async () => {
    for (const role of ["exec", "finance", "user", "vendor"] as const) {
      await expect(callerFor(role).employees.linkUser({ employeeId: 10, userId: 42 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(callerFor(role).employees.unlinkUser({ employeeId: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(callerFor(role).employees.linkCandidates({ employeeId: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(db.setEmployeeUserIdIfUnlinked).not.toHaveBeenCalled();
  });
});

describe("employees.unlinkUser / linkedUser", () => {
  it("clears the link and audits the previous user", async () => {
    vi.mocked(db.getEmployeeById).mockResolvedValue(emp({ userId: 42 }));
    await expect(admin.employees.unlinkUser({ employeeId: 10 })).resolves.toEqual({ success: true, changed: true });
    expect(db.clearEmployeeUserId).toHaveBeenCalledWith(10);
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityId: 10, oldValues: { userId: 42 }, newValues: { userId: null } }));
  });

  it("unlinking an unlinked employee is a no-op; a missing one is NOT_FOUND", async () => {
    await expect(admin.employees.unlinkUser({ employeeId: 10 })).resolves.toEqual({ success: true, changed: false });
    expect(db.clearEmployeeUserId).not.toHaveBeenCalled();
    vi.mocked(db.getEmployeeById).mockResolvedValue(undefined);
    await expect(admin.employees.unlinkUser({ employeeId: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("linkedUser returns the linked login's public fields, or null", async () => {
    await expect(admin.employees.linkedUser({ employeeId: 10 })).resolves.toBeNull();
    vi.mocked(db.getEmployeeById).mockResolvedValue(emp({ userId: 42 }));
    await expect(admin.employees.linkedUser({ employeeId: 10 })).resolves.toEqual({ id: 42, name: "Dana", email: "dana@example.com", role: "user" });
  });
});

describe("employees.linkCandidates", () => {
  it("email matches first, then unlinked internal users in the same company", async () => {
    vi.mocked(db.getEmployeeById).mockResolvedValue(emp({ personalEmail: "dana.home@example.com" }));
    vi.mocked(db.getAllUsers).mockResolvedValue([
      usr({ id: 1, name: "Admin", email: "admin@example.com", role: "admin" }),
      usr({ id: 2, name: "Zed Personal", email: "DANA.HOME@example.com" }),
      usr({ id: 3, name: "Already Linked", email: "linked@example.com" }),
      usr({ id: 4, name: "Vendor", email: "v@example.com", role: "vendor" }),
      usr({ id: 5, name: "Other Co", email: "o@example.com", companyId: 7 }),
      usr({ id: 6, name: "Beth", email: "beth@example.com", companyId: null }),
      usr({ id: 7, name: "Inactive", email: "i@example.com", isActive: false }),
      usr({ id: 8, name: "Contractor", email: "dana@example.com", role: "contractor" }),
    ]);
    vi.mocked(db.getEmployees).mockResolvedValue([emp({ id: 11, userId: 3 }), emp({ id: 12, userId: null })]);

    const res = await admin.employees.linkCandidates({ employeeId: 10 });
    expect(res.map((c) => [c.id, c.match])).toEqual([[2, "email"], [1, "company"], [6, "company"]]);
  });
});

describe("rankLinkCandidates (pure)", () => {
  it("ranks email matches across companies ahead of same-company users", () => {
    const res = rankLinkCandidates(
      { email: "a@x.com", personalEmail: null, companyId: 1 },
      [usr({ id: 1, name: "B", email: "b@x.com" }), usr({ id: 2, name: "Z", email: "A@x.com", companyId: 9 })],
      new Set(),
    );
    expect(res.map((c) => c.id)).toEqual([2, 1]);
  });
});

describe("teamInvites.invite with employeeId", () => {
  it("records the invite under the employee's company when the email matches", async () => {
    vi.mocked(db.getEmployeeById).mockResolvedValue(emp({ companyId: 3 }));
    vi.mocked(db.getEmployeesByEmail).mockResolvedValue([emp({ companyId: 3 })]);
    vi.mocked(db.createTeamInvite).mockResolvedValue({ id: 1, token: "t" });
    const res = await admin.teamInvites.invite({ email: "Dana@Example.com", employeeId: 10 });
    expect(res.success).toBe(true);
    expect(db.createTeamInvite).toHaveBeenCalledWith(expect.objectContaining({ companyId: 3, email: "dana@example.com", role: "user" }));
  });

  it("rejects a mismatched email, a linked employee, an ambiguous email and a missing employee", async () => {
    await expect(admin.teamInvites.invite({ email: "someone@else.com", employeeId: 10 })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    vi.mocked(db.getEmployeesByEmail).mockResolvedValueOnce([emp(), emp({ id: 11, firstName: "Twin" })]);
    await expect(admin.teamInvites.invite({ email: "dana@example.com", employeeId: 10 })).rejects.toMatchObject({ code: "CONFLICT" });

    vi.mocked(db.getEmployeeById).mockResolvedValueOnce(emp({ userId: 42 }));
    await expect(admin.teamInvites.invite({ email: "dana@example.com", employeeId: 10 })).rejects.toMatchObject({ code: "CONFLICT" });

    vi.mocked(db.getEmployeeById).mockResolvedValueOnce(undefined);
    await expect(admin.teamInvites.invite({ email: "dana@example.com", employeeId: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.createTeamInvite).not.toHaveBeenCalled();
  });
});

describe("linkEmployeeForAcceptedInvite", () => {
  it("links the single unlinked employee with the invite email", async () => {
    vi.mocked(db.getEmployeesByEmail).mockResolvedValue([emp()]);
    await expect(linkEmployeeForAcceptedInvite("dana@example.com", 42)).resolves.toEqual({ linked: true, employeeId: 10 });
    expect(db.setEmployeeUserIdIfUnlinked).toHaveBeenCalledWith(10, 42);
    expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ userId: 42, entityId: 10, newValues: { userId: 42 } }));
  });

  it("skips (without throwing) when nothing matches, the match is ambiguous, or the user is linked elsewhere", async () => {
    await expect(linkEmployeeForAcceptedInvite("nobody@example.com", 42)).resolves.toMatchObject({ linked: false });

    vi.mocked(db.getEmployeesByEmail).mockResolvedValueOnce([emp(), emp({ id: 11 })]);
    await expect(linkEmployeeForAcceptedInvite("dana@example.com", 42)).resolves.toEqual({ linked: false, reason: "ambiguous" });

    vi.mocked(db.getEmployeesByEmail).mockResolvedValueOnce([emp()]);
    vi.mocked(db.getEmployeeByUserId).mockResolvedValueOnce(emp({ id: 11, userId: 42 }));
    await expect(linkEmployeeForAcceptedInvite("dana@example.com", 42)).resolves.toMatchObject({ linked: false });

    vi.mocked(db.getEmployeesByEmail).mockRejectedValueOnce(new Error("db down"));
    await expect(linkEmployeeForAcceptedInvite("dana@example.com", 42)).resolves.toEqual({ linked: false, reason: "error" });
    expect(db.setEmployeeUserIdIfUnlinked).not.toHaveBeenCalled();
  });
});
