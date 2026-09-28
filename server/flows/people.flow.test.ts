/**
 * People (HR) process flow: department → candidate pipeline → offer letter →
 * employee → employee portal → time tracking → invoice → payment, plus the
 * ownership and role-gating regressions along the way.
 *
 * Runs the real tRPC routers against a stateful in-memory replacement for
 * server/db.ts. Every mocked helper mirrors the contract of the real one
 * (filters, defaults, return shapes) so the routers' orchestration is what
 * gets exercised.
 */
import { describe, expect, it, vi, beforeAll } from "vitest";
import type { Table } from "./_harness";
import { ctxFor } from "./_harness";

type Row = { id: number; [k: string]: any };

interface State {
  departments: Table<Row>;
  candidates: Table<Row>;
  offerLetters: Table<Row>;
  employees: Table<Row>;
  documents: Table<Row>;
  teamInvites: Table<Row>;
  timeEntries: Table<Row>;
  timeInvoices: Table<Row>;
  employeePayments: Table<Row>;
  auditLogs: Row[];
  users: Row[];
}

vi.mock("../db", async () => {
  const { table } = await import("./_harness");
  const state: State = {
    departments: table<Row>(),
    candidates: table<Row>(),
    offerLetters: table<Row>(),
    employees: table<Row>(),
    documents: table<Row>(),
    teamInvites: table<Row>(),
    timeEntries: table<Row>(),
    timeInvoices: table<Row>(),
    employeePayments: table<Row>(),
    auditLogs: [],
    users: [
      { id: 1, name: "Admin User", email: "admin@example.com", role: "admin" },
      { id: 42, name: "Dana Employee", email: "dana@example.com", role: "user" },
      { id: 43, name: "Other User", email: "other@example.com", role: "user" },
    ],
  };
  const byDateDesc = (key: string) => (a: Row, b: Row) => new Date(b[key]).getTime() - new Date(a[key]).getTime();
  const num = (v: unknown) => parseFloat(String(v ?? "0") || "0");
  // Reads return snapshots, like rows coming back from MySQL.
  const snap = (r?: Row) => (r ? { ...r } : r);

  return {
    __state: state,
    getDb: vi.fn().mockResolvedValue({}),
    createAuditLog: vi.fn(async (data: Row) => { state.auditLogs.push(data); }),
    getAllUsers: vi.fn(async () => state.users.slice()),

    // ---- departments
    getDepartments: vi.fn(async (companyId?: number) =>
      state.departments.filter((d) => !companyId || d.companyId === companyId).sort((a, b) => a.name.localeCompare(b.name))),
    createDepartment: vi.fn(async (data: Row) => ({ id: state.departments.insert({ isActive: true, ...data }).id })),

    // ---- recruiting
    listRecruitingCandidates: vi.fn(async () => state.candidates.all().sort(byDateDesc("appliedAt"))),
    createRecruitingCandidate: vi.fn(async (data: Row) =>
      ({ id: state.candidates.insert({ stage: "applied", source: "other", appliedAt: new Date(), ...data }).id })),
    updateRecruitingCandidate: vi.fn(async (id: number, data: Row) => { state.candidates.update(id, data); }),

    // ---- offer letters
    getOfferLetters: vi.fn(async (f?: { companyId?: number; status?: string }) =>
      state.offerLetters
        .filter((o) => (!f?.companyId || o.companyId === f.companyId) && (!f?.status || o.status === f.status))
        .sort(byDateDesc("createdAt"))),
    getOfferLetterById: vi.fn(async (id: number) => snap(state.offerLetters.get(id))),
    createOfferLetter: vi.fn(async (data: Row) => ({ id: state.offerLetters.insert({ status: "draft", ...data }).id, ...data })),
    updateOfferLetter: vi.fn(async (id: number, data: Row) => { state.offerLetters.update(id, data); return { id, ...data }; }),

    // ---- employees
    getEmployees: vi.fn(async (f?: { companyId?: number; status?: string; departmentId?: number }) =>
      state.employees
        .filter((e) =>
          (!f?.companyId || e.companyId === f.companyId) &&
          (!f?.status || e.status === f.status) &&
          (!f?.departmentId || e.departmentId === f.departmentId))
        .sort((a, b) => String(a.lastName).localeCompare(String(b.lastName)))),
    getEmployeeById: vi.fn(async (id: number) => snap(state.employees.get(id))),
    getEmployeeByUserId: vi.fn(async (userId: number) => snap(state.employees.find((e) => e.userId === userId))),
    createEmployee: vi.fn(async (data: Row) => ({ id: state.employees.insert({ status: "active", salaryFrequency: "annual", ...data }).id })),
    updateEmployee: vi.fn(async (id: number, data: Row) => { state.employees.update(id, data); }),

    // ---- documents
    getDocuments: vi.fn(async (f?: { companyId?: number; type?: string; referenceType?: string; referenceId?: number }) =>
      state.documents
        .filter((d) =>
          (!f?.companyId || d.companyId === f.companyId) &&
          (!f?.type || d.type === f.type) &&
          (!f?.referenceType || d.referenceType === f.referenceType) &&
          (!f?.referenceId || d.referenceId === f.referenceId))
        .sort(byDateDesc("createdAt"))),
    createDocument: vi.fn(async (data: Row) => ({ id: state.documents.insert(data).id })),

    // ---- team invites
    getTeamInvites: vi.fn(async (companyId?: number) =>
      state.teamInvites.filter((i) => !companyId || i.companyId === companyId).sort(byDateDesc("createdAt"))),
    getTeamInviteById: vi.fn(async (id: number) => snap(state.teamInvites.get(id))),
    createTeamInvite: vi.fn(async (data: Row) => ({ id: state.teamInvites.insert({ status: "pending", ...data }).id, token: data.token })),
    updateTeamInvite: vi.fn(async (id: number, data: Row) => { state.teamInvites.update(id, data); }),

    // ---- time tracking
    getTimeEntries: vi.fn(async (f?: { userId?: number; status?: string; startDate?: string; endDate?: string }) =>
      state.timeEntries
        .filter((e) =>
          (!f?.userId || e.userId === f.userId) &&
          (!f?.status || e.status === f.status) &&
          (!f?.startDate || new Date(e.date) >= new Date(f.startDate)) &&
          (!f?.endDate || new Date(e.date) <= new Date(f.endDate)))
        .sort(byDateDesc("date"))),
    getTimeEntryById: vi.fn(async (id: number) => snap(state.timeEntries.get(id))),
    createTimeEntry: vi.fn(async (data: Row) => {
      const totalAmount = (num(data.hours) * num(data.hourlyRate)).toFixed(2);
      return { id: state.timeEntries.insert({ billable: true, status: "draft", category: "other", ...data, totalAmount }).id };
    }),
    updateTimeEntry: vi.fn(async (id: number, data: Row) => {
      if (data.hours || data.hourlyRate) {
        const existing = state.timeEntries.get(id);
        if (existing) data.totalAmount = (num(data.hours ?? existing.hours) * num(data.hourlyRate ?? existing.hourlyRate)).toFixed(2);
      }
      state.timeEntries.update(id, data);
    }),
    deleteTimeEntry: vi.fn(async (id: number) => { state.timeEntries.remove(id); }),
    getTimeInvoices: vi.fn(async (f?: { userId?: number; status?: string }) =>
      state.timeInvoices
        .filter((i) => (!f?.userId || i.userId === f.userId) && (!f?.status || i.status === f.status))
        .sort(byDateDesc("createdAt"))),
    getTimeInvoiceById: vi.fn(async (id: number) => snap(state.timeInvoices.get(id))),
    createTimeInvoice: vi.fn(async (data: Row) => ({ id: state.timeInvoices.insert({ status: "draft", taxAmount: "0", ...data }).id })),
    updateTimeInvoice: vi.fn(async (id: number, data: Row) => { state.timeInvoices.update(id, data); }),

    // ---- employee payments
    getEmployeePayments: vi.fn(async (f?: { companyId?: number; employeeId?: number; status?: string }) =>
      state.employeePayments
        .filter((p) =>
          (!f?.companyId || p.companyId === f.companyId) &&
          (!f?.employeeId || p.employeeId === f.employeeId) &&
          (!f?.status || p.status === f.status))
        .sort(byDateDesc("paymentDate"))),
    createEmployeePayment: vi.fn(async (data: Row) => ({ id: state.employeePayments.insert({ status: "pending", currency: "USD", ...data }).id })),
  };
});

vi.mock("../_core/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, messageId: "msg-1" }),
  isEmailConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("../storage", () => ({
  storagePut: vi.fn(async (key: string) => ({ key, url: `https://files.example/${key}` })),
  storageGet: vi.fn(),
  storageDelete: vi.fn(),
}));

import * as db from "../db";
import { sendEmail } from "../_core/email";
import { appRouter } from "../routers";

const state = (db as unknown as { __state: State }).__state;

const admin = appRouter.createCaller(ctxFor("admin", { id: 1, name: "Admin User", email: "admin@example.com" }));
const EMPLOYEE_USER_ID = 42;
const OTHER_USER_ID = 43;
const employee = appRouter.createCaller(ctxFor("user", { id: EMPLOYEE_USER_ID, name: "Dana Employee", email: "dana@example.com" }));
const otherUser = appRouter.createCaller(ctxFor("user", { id: OTHER_USER_ID, name: "Other User", email: "other@example.com" }));
const finance = appRouter.createCaller(ctxFor("finance", { id: 5 }));
const vendor = appRouter.createCaller(ctxFor("vendor", { id: 7, linkedVendorId: 99 }));

// Shared ids threaded through the steps (tests in a file run in order).
const ids = {
  departmentId: 0,
  managerId: 0,
  candidateId: 0,
  offerLetterId: 0,
  employeeId: 0,
  documentId: 0,
  entryIds: [] as number[],
  foreignEntryId: 0,
  invoiceId: 0,
  invoiceNumber: "",
  paymentId: 0,
};

describe("People process: hire → onboard → track time → get paid", () => {
  beforeAll(() => {
    // An existing manager the new hire will report to.
    ids.managerId = state.employees.insert({
      firstName: "Morgan", lastName: "Manager", email: "morgan@example.com",
      employeeNumber: "EMP-0001", status: "active", jobTitle: "Head of Ops",
    }).id;
  });

  it("1a. admin creates the Operations department", async () => {
    const created = await admin.departments.create({ name: "Operations", code: "OPS", managerId: ids.managerId });
    ids.departmentId = created.id;
    expect(created.id).toBeGreaterThan(0);

    const list = await admin.departments.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: ids.departmentId, name: "Operations", code: "OPS", managerId: ids.managerId });
    expect(state.auditLogs.at(-1)).toMatchObject({ userId: 1, action: "create", entityType: "department", entityId: ids.departmentId, entityName: "Operations" });
  });

  it("1b. a candidate is added and moved through every stage to hired", async () => {
    const created = await admin.recruiting.candidates.create({
      name: "Dana Employee", email: "dana@example.com", position: "Operations Analyst", source: "referral",
    });
    ids.candidateId = created.id;

    let [row] = await admin.recruiting.candidates.list();
    expect(row).toMatchObject({ id: ids.candidateId, name: "Dana Employee", stage: "applied", createdBy: 1, source: "referral" });

    for (const stage of ["screening", "interview", "assessment", "offer", "hired"] as const) {
      const res = await admin.recruiting.candidates.update({ id: ids.candidateId, stage });
      expect(res).toEqual({ success: true });
      [row] = await admin.recruiting.candidates.list();
      expect(row.stage).toBe(stage);
    }
    expect(state.candidates.get(ids.candidateId)?.stage).toBe("hired");
  });

  it("2a. an offer letter is generated for the candidate and marked sent", async () => {
    const created = await admin.offerLetters.create({
      candidateName: "Dana Employee",
      candidateEmail: "dana@example.com",
      position: "Operations Analyst",
      department: "Operations",
      startDate: "2026-10-01",
      salary: "85000",
      salaryPeriod: "annual",
      employmentType: "full_time",
      reportingTo: "Morgan Manager",
    });
    ids.offerLetterId = created.id;
    expect(created).toMatchObject({ candidateName: "Dana Employee", position: "Operations Analyst", createdBy: 1 });
    expect(created.startDate).toEqual(new Date("2026-10-01"));

    const stored = await admin.offerLetters.get({ id: ids.offerLetterId });
    expect(stored).toMatchObject({ status: "draft", salary: "85000", salaryPeriod: "annual" });

    // There is no offerLetters.send procedure (and no email is sent by this
    // router); "sending" is recorded by updating the status + sentAt.
    const sentAt = "2026-09-28T10:00:00.000Z";
    await admin.offerLetters.update({ id: ids.offerLetterId, status: "sent", sentAt });
    const sent = await admin.offerLetters.get({ id: ids.offerLetterId });
    expect(sent?.status).toBe("sent");
    expect(sent?.sentAt).toEqual(new Date(sentAt));
    expect(sendEmail).not.toHaveBeenCalled();

    const sentList = await admin.offerLetters.list({ status: "sent" });
    expect(sentList.map((o) => o.id)).toEqual([ids.offerLetterId]);
    expect(await admin.offerLetters.list({ status: "draft" })).toEqual([]);

    // Accepted by the candidate.
    await admin.offerLetters.update({ id: ids.offerLetterId, status: "accepted", respondedAt: "2026-09-29T09:00:00.000Z" });
    expect((await admin.offerLetters.get({ id: ids.offerLetterId }))?.status).toBe("accepted");
  });

  it("2b. the hire is converted into an employee record and read back", async () => {
    const hireDate = new Date("2026-10-01T00:00:00.000Z");
    const created = await admin.employees.create({
      firstName: "Dana",
      lastName: "Employee",
      email: "dana@example.com",
      hireDate,
      departmentId: ids.departmentId,
      managerId: ids.managerId,
      jobTitle: "Operations Analyst",
      employmentType: "full_time",
      salary: "85000",
      salaryFrequency: "annual",
    });
    ids.employeeId = created.id;

    const emp = await admin.employees.get({ id: ids.employeeId });
    expect(emp).toMatchObject({
      id: ids.employeeId,
      firstName: "Dana",
      lastName: "Employee",
      departmentId: ids.departmentId,
      managerId: ids.managerId,
      jobTitle: "Operations Analyst",
      status: "active",
      salary: "85000",
    });
    expect(emp?.hireDate).toEqual(hireDate);
    expect(emp?.employeeNumber).toMatch(/^EMP-\d{4}-\d{4}$/);

    const inDept = await admin.employees.list({ departmentId: ids.departmentId });
    expect(inDept.map((e) => e.id)).toEqual([ids.employeeId]);
    const all = await admin.employees.list();
    expect(all.map((e) => e.lastName)).toEqual(["Employee", "Manager"]); // sorted by last name

    // Link the employee to their login. No procedure exposes this link
    // (employees.update has no userId field); it is set directly in the store.
    expect(await employee.employeePortal.me()).toBeNull();
    state.employees.update(ids.employeeId, { userId: EMPLOYEE_USER_ID });
  });

  it("3a. the employee sees their own profile in the portal", async () => {
    const me = await employee.employeePortal.me();
    expect(me).toMatchObject({
      id: ids.employeeId,
      firstName: "Dana",
      jobTitle: "Operations Analyst",
      department: { id: ids.departmentId, name: "Operations" },
    });

    await employee.employeePortal.updateProfile({ phone: "+1 555 0100", city: "Austin" });
    expect(await employee.employeePortal.me()).toMatchObject({ phone: "+1 555 0100", city: "Austin" });

    // A user with no employee record gets a clear NOT_FOUND on self-service actions.
    await expect(otherUser.employeePortal.updateProfile({ city: "Nowhere" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const directory = await employee.employeePortal.directory();
    expect(directory).toHaveLength(2);
    expect(directory.find((d) => d.id === ids.employeeId)).toEqual({
      id: ids.employeeId, firstName: "Dana", lastName: "Employee", jobTitle: "Operations Analyst",
      email: "dana@example.com", phone: "+1 555 0100", departmentId: ids.departmentId,
    });
    expect(Object.keys(directory[0])).not.toContain("salary");
  });

  it("3b. an HR document is attached to the employee and shows up in their portal", async () => {
    const doc = await admin.documents.upload({
      name: "signed-offer.pdf",
      type: "hr",
      referenceType: "employee",
      referenceId: ids.employeeId,
      fileData: Buffer.from("signed offer letter").toString("base64"),
      mimeType: "application/pdf",
      description: "Signed offer letter",
    });
    ids.documentId = doc.id;

    const stored = state.documents.get(ids.documentId)!;
    expect(stored).toMatchObject({ name: "signed-offer.pdf", type: "hr", referenceType: "employee", referenceId: ids.employeeId, uploadedBy: 1, mimeType: "application/pdf", fileSize: 19 });
    expect(stored.fileUrl).toMatch(/^https:\/\/files\.example\/documents\/1\//);

    const mine = await employee.employeePortal.documents();
    expect(mine.map((d) => d.id)).toEqual([ids.documentId]);
    expect(await admin.documents.list({ type: "hr", referenceType: "employee", referenceId: ids.employeeId })).toHaveLength(1);
  });

  it("3c. admin sends a team invite for the employee's login (email asserted); accept is not a tRPC step", async () => {
    vi.mocked(sendEmail).mockClear();
    const res = await admin.teamInvites.invite({ email: "Dana@Example.com", name: "Dana Employee", role: "user" });
    expect(res.success).toBe(true);
    expect(res.token).toMatch(/^[0-9a-f]{64}$/);

    const [invite] = await admin.teamInvites.list();
    expect(invite).toMatchObject({ email: "dana@example.com", name: "Dana Employee", role: "user", invitedBy: 1, status: "pending", token: res.token });
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe("Dana@Example.com");
    expect(mail.subject).toContain("invited to join Superhumn");
    expect(mail.html).toContain(`/login?invite=${res.token}`);
    expect(mail.html).toContain("<strong>Role:</strong> User");

    // Acceptance happens in the HTTP signup handler (POST /api/auth/signup
    // with ?invite=token), not through tRPC; a non-admin cannot invite.
    await expect(employee.teamInvites.invite({ email: "x@example.com" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("4a. the employee logs a week of time and only sees their own entries", async () => {
    // Someone else's entry must never be visible to the employee.
    ids.foreignEntryId = (await otherUser.timeTracking.entries.create({
      taskDescription: "Other person's work", date: "2026-09-22", hours: "3", hourlyRate: "50",
    })).id;

    const week = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"];
    for (const date of week) {
      const res = await employee.timeTracking.entries.create({
        taskDescription: `Ops analysis ${date}`, date, hours: "8", hourlyRate: "50", category: "operations",
      });
      ids.entryIds.push(res.id);
    }

    const mine = await employee.timeTracking.entries.list();
    expect(mine).toHaveLength(5);
    expect(mine.every((e) => e.userId === EMPLOYEE_USER_ID)).toBe(true);
    expect(mine.map((e) => e.id)).not.toContain(ids.foreignEntryId);
    expect(mine[0]).toMatchObject({ hours: "8", hourlyRate: "50", totalAmount: "400.00", status: "draft", billable: true, category: "operations" });
    expect(mine[0].date).toEqual(new Date("2026-09-25")); // newest first

    // Asking for another user's entries as a non-admin still returns only your own.
    const sneaky = await employee.timeTracking.entries.list({ userId: OTHER_USER_ID });
    expect(sneaky.map((e) => e.userId)).toEqual([42, 42, 42, 42, 42]);

    // Admin can see the other user's entry.
    const adminView = await admin.timeTracking.entries.list({ userId: OTHER_USER_ID });
    expect(adminView.map((e) => e.id)).toEqual([ids.foreignEntryId]);
  });

  it("4b. the employee submits the entries and admin approves them", async () => {
    for (const id of ids.entryIds) {
      expect(await employee.timeTracking.entries.submit({ id })).toEqual({ success: true });
    }
    expect((await employee.timeTracking.entries.list({ status: "submitted" })).length).toBe(5);

    await expect(employee.timeTracking.entries.approve({ id: ids.entryIds[0] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Approving an entry that does not exist is NOT_FOUND rather than a silent no-op update.
    await expect(admin.timeTracking.entries.approve({ id: 9999 })).rejects.toMatchObject({ code: "NOT_FOUND" });

    for (const id of ids.entryIds) {
      expect(await admin.timeTracking.entries.approve({ id })).toEqual({ success: true });
    }
    const approved = await employee.timeTracking.entries.list({ status: "approved" });
    expect(approved).toHaveLength(5);
    expect(approved[0]).toMatchObject({ approvedBy: 1 });
    expect(approved[0].approvedAt).toBeInstanceOf(Date);
  });

  it("4c. the employee generates a time invoice for the week", async () => {
    // Outside the period there is nothing to bill.
    await expect(employee.timeTracking.generateInvoice({ periodStart: "2026-09-01", periodEnd: "2026-09-07", hourlyRate: "50" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });

    const inv = await employee.timeTracking.generateInvoice({ periodStart: "2026-09-21", periodEnd: "2026-09-25", hourlyRate: "50" });
    ids.invoiceId = inv.id;
    ids.invoiceNumber = inv.invoiceNumber;
    expect(inv).toMatchObject({ totalHours: 40, totalAmount: 2000, entriesCount: 5 });
    expect(inv.invoiceNumber).toMatch(/^INV-[0-9A-Z]+$/);

    const stored = await employee.timeTracking.invoices.get({ id: ids.invoiceId });
    expect(stored).toMatchObject({
      userId: EMPLOYEE_USER_ID, status: "draft", totalHours: "40.00", hourlyRate: "50.00", subtotal: "2000.00", totalAmount: "2000.00",
    });
    expect(stored.periodStart).toEqual(new Date("2026-09-21"));

    // Billed entries move to "invoiced"; the other user's entry is untouched.
    expect((await employee.timeTracking.entries.list({ status: "invoiced" })).length).toBe(5);
    expect(state.timeEntries.get(ids.foreignEntryId)?.status).toBe("draft");

    // Another user can neither see nor submit this invoice.
    await expect(otherUser.timeTracking.invoices.get({ id: ids.invoiceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(otherUser.timeTracking.submitInvoice({ invoiceId: ids.invoiceId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await otherUser.timeTracking.invoices.list()).toEqual([]);
  });

  it("4d. submitting the invoice emails Accounts Payable and marks it sent", async () => {
    vi.mocked(sendEmail).mockClear();
    const res = await employee.timeTracking.submitInvoice({ invoiceId: ids.invoiceId });
    expect(res).toEqual({ success: true, invoiceNumber: ids.invoiceNumber, sentTo: "superhumn@ap.mercury.com", error: undefined });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe("superhumn@ap.mercury.com");
    expect(mail.from).toBe("dana@example.com");
    expect(mail.subject).toBe(`Invoice ${ids.invoiceNumber} from Dana Employee — Sep 21, 2026 - Sep 25, 2026`);
    expect(mail.html).toContain("<strong>$2000.00</strong>");
    expect((mail.html!.match(/Ops analysis 2026-09-2\d/g) ?? []).length).toBe(5);
    expect(mail.html).not.toContain("Other person's work");

    const sent = await employee.timeTracking.invoices.get({ id: ids.invoiceId });
    expect(sent).toMatchObject({ status: "sent", sentTo: "superhumn@ap.mercury.com" });
    expect(sent.sentAt).toBeInstanceOf(Date);
    expect(sent.submittedAt).toBeInstanceOf(Date);
    expect((await employee.timeTracking.invoices.list({ status: "sent" })).map((i) => i.id)).toEqual([ids.invoiceId]);
  });

  it("4e. finance records the payment against the invoice and the employee sees it as a payslip", async () => {
    await expect(employee.employeePayments.create({
      employeeId: ids.employeeId, amount: "2000.00", paymentDate: new Date("2026-09-30"),
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const payment = await finance.employeePayments.create({
      employeeId: ids.employeeId,
      type: "salary",
      amount: "2000.00",
      paymentDate: new Date("2026-09-30T00:00:00.000Z"),
      payPeriodStart: new Date("2026-09-21T00:00:00.000Z"),
      payPeriodEnd: new Date("2026-09-25T00:00:00.000Z"),
      paymentMethod: "direct_deposit",
      notes: `Time invoice ${ids.invoiceNumber}`,
    });
    ids.paymentId = payment.id;

    const [row] = await finance.employeePayments.list({ employeeId: ids.employeeId });
    expect(row).toMatchObject({
      id: ids.paymentId, employeeId: ids.employeeId, type: "salary", amount: "2000.00",
      paymentMethod: "direct_deposit", createdBy: 5, notes: `Time invoice ${ids.invoiceNumber}`,
    });
    expect(row.paymentNumber).toMatch(/^EMPAY-\d{4}-\d{4}$/);
    expect(row.paymentDate).toEqual(new Date("2026-09-30T00:00:00.000Z"));
    expect(state.auditLogs.at(-1)).toMatchObject({ userId: 5, action: "create", entityType: "employeePayment", entityId: ids.paymentId, entityName: row.paymentNumber });

    const payslips = await employee.employeePortal.payslips();
    expect(payslips.map((p) => p.id)).toEqual([ids.paymentId]);
    expect(await employee.employeePayments.list().catch((e) => e.code)).toBe("FORBIDDEN");
  });

  it("5. ownership: another non-admin user cannot update or delete the employee's time entry", async () => {
    const target = ids.entryIds[0];
    await expect(otherUser.timeTracking.entries.update({ id: target, hours: "1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(otherUser.timeTracking.entries.delete({ id: target })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(otherUser.timeTracking.entries.submit({ id: target })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.timeEntries.get(target)).toMatchObject({ hours: "8", status: "invoiced" });

    await expect(employee.timeTracking.entries.update({ id: 9999, hours: "1" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The owner and an admin can.
    expect(await employee.timeTracking.entries.update({ id: target, notes: "corrected" })).toEqual({ success: true });
    expect(state.timeEntries.get(target)?.notes).toBe("corrected");
    expect(await admin.timeTracking.entries.delete({ id: ids.foreignEntryId })).toEqual({ success: true });
    expect(state.timeEntries.get(ids.foreignEntryId)).toBeUndefined();
  });

  it("6. role gating: a vendor account cannot list employees", async () => {
    await expect(vendor.employees.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(vendor.employees.get({ id: ids.employeeId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(vendor.employees.create({ firstName: "X", lastName: "Y" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Internal staff (even the basic role) can still read the directory.
    expect((await employee.employees.list()).length).toBe(2);
  });
});
