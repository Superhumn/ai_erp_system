import { eq, and, desc, sql } from "drizzle-orm";
import {
  departments,
  employees,
  InsertEmployee,
  compensationHistory,
  employeePayments,
  ptoBalances,
  leaveRequests,
  onboardingTasks,
  employeeBenefits,
  employeeEmergencyContacts,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getDepartments(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) { return db.select().from(departments).where(eq(departments.companyId, companyId)).orderBy(departments.name); }
  return db.select().from(departments).orderBy(departments.name);
}
export async function createDepartment(data: typeof departments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(departments).values(data);
  return { id: result[0].insertId };
}
export async function getEmployees(filters?: { companyId?: number; status?: string; departmentId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(employees.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(employees.status, filters.status as any));
  if (filters?.departmentId) conditions.push(eq(employees.departmentId, filters.departmentId));
  if (conditions.length > 0) { return db.select().from(employees).where(and(...conditions)).orderBy(employees.lastName); }
  return db.select().from(employees).orderBy(employees.lastName);
}
export async function getEmployeeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return result[0];
}
export async function createEmployee(data: InsertEmployee) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(employees).values(data);
  return { id: result[0].insertId };
}
export async function updateEmployee(id: number, data: Partial<InsertEmployee>) {
  const db = await getDb();
  if (!db) return;
  await db.update(employees).set(data).where(eq(employees.id, id));
}
export async function deleteEmployee(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(employees).where(eq(employees.id, id));
}
export async function getCompensationHistory(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(compensationHistory).where(eq(compensationHistory.employeeId, employeeId)).orderBy(desc(compensationHistory.effectiveDate));
}
export async function createCompensationRecord(data: typeof compensationHistory.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(compensationHistory).values(data);
  return { id: result[0].insertId };
}
export async function getEmployeePayments(filters?: { companyId?: number; employeeId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(employeePayments.companyId, filters.companyId));
  if (filters?.employeeId) conditions.push(eq(employeePayments.employeeId, filters.employeeId));
  if (filters?.status) conditions.push(eq(employeePayments.status, filters.status as any));
  if (conditions.length > 0) { return db.select().from(employeePayments).where(and(...conditions)).orderBy(desc(employeePayments.paymentDate)); }
  return db.select().from(employeePayments).orderBy(desc(employeePayments.paymentDate));
}
export async function createEmployeePayment(data: typeof employeePayments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(employeePayments).values(data);
  return { id: result[0].insertId };
}

// ==========================
// Employee Portal helpers
// ==========================

export async function getEmployeeByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
  return result[0];
}

export async function getPtoBalances(employeeId: number, year?: number) {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(ptoBalances.employeeId, employeeId)];
  if (year) conds.push(eq(ptoBalances.year, year));
  return db.select().from(ptoBalances).where(and(...conds)).orderBy(ptoBalances.leaveType);
}

export async function upsertPtoBalance(data: typeof ptoBalances.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(ptoBalances)
    .where(and(
      eq(ptoBalances.employeeId, data.employeeId),
      eq(ptoBalances.leaveType, data.leaveType),
      eq(ptoBalances.year, data.year),
    ))
    .limit(1);
  if (existing[0]) {
    await db.update(ptoBalances).set(data).where(eq(ptoBalances.id, existing[0].id));
    return { id: existing[0].id };
  }
  const result = await db.insert(ptoBalances).values(data);
  return { id: result[0].insertId };
}

export async function adjustPtoBalance(
  employeeId: number,
  leaveType: typeof ptoBalances.$inferInsert["leaveType"],
  year: number,
  deltas: { used?: number; pending?: number },
) {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select()
    .from(ptoBalances)
    .where(and(
      eq(ptoBalances.employeeId, employeeId),
      eq(ptoBalances.leaveType, leaveType),
      eq(ptoBalances.year, year),
    ))
    .limit(1);
  if (!existing[0]) throw new Error(`No PTO balance record found for employee ${employeeId}, leaveType ${leaveType}, year ${year}`);
  const updates: Record<string, unknown> = {};
  if (deltas.used !== undefined) {
    updates.usedHours = sql`${ptoBalances.usedHours} + ${deltas.used}`;
  }
  if (deltas.pending !== undefined) {
    updates.pendingHours = sql`${ptoBalances.pendingHours} + ${deltas.pending}`;
  }
  await db.update(ptoBalances).set(updates).where(eq(ptoBalances.id, existing[0].id));
}

export async function getLeaveRequests(filters?: { employeeId?: number; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (filters?.employeeId) conds.push(eq(leaveRequests.employeeId, filters.employeeId));
  if (filters?.status) conds.push(eq(leaveRequests.status, filters.status as any));
  const q = db.select().from(leaveRequests);
  if (conds.length > 0) {
    return q.where(and(...conds)).orderBy(desc(leaveRequests.startDate));
  }
  return q.orderBy(desc(leaveRequests.startDate));
}

export async function getLeaveRequestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
  return result[0];
}

export async function createLeaveRequest(data: typeof leaveRequests.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(leaveRequests).values(data);
  return { id: result[0].insertId };
}

export async function updateLeaveRequest(id: number, data: Partial<typeof leaveRequests.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(leaveRequests).set(data).where(eq(leaveRequests.id, id));
}

export async function getOnboardingTasks(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(onboardingTasks)
    .where(eq(onboardingTasks.employeeId, employeeId))
    .orderBy(onboardingTasks.sortOrder, onboardingTasks.id);
}

export async function createOnboardingTask(data: typeof onboardingTasks.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(onboardingTasks).values(data);
  return { id: result[0].insertId };
}

export async function updateOnboardingTask(id: number, data: Partial<typeof onboardingTasks.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(onboardingTasks).set(data).where(eq(onboardingTasks.id, id));
}

export async function getEmployeeBenefits(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(employeeBenefits)
    .where(eq(employeeBenefits.employeeId, employeeId))
    .orderBy(employeeBenefits.benefitType);
}

export async function upsertEmployeeBenefit(data: typeof employeeBenefits.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(employeeBenefits)
    .where(and(
      eq(employeeBenefits.employeeId, data.employeeId),
      eq(employeeBenefits.benefitType, data.benefitType),
    ))
    .limit(1);
  if (existing[0]) {
    await db.update(employeeBenefits).set(data).where(eq(employeeBenefits.id, existing[0].id));
    return { id: existing[0].id };
  }
  const result = await db.insert(employeeBenefits).values(data);
  return { id: result[0].insertId };
}

export async function updateEmployeeBenefit(id: number, data: Partial<typeof employeeBenefits.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(employeeBenefits).set(data).where(eq(employeeBenefits.id, id));
}

export async function getEmergencyContacts(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(employeeEmergencyContacts)
    .where(eq(employeeEmergencyContacts.employeeId, employeeId))
    .orderBy(desc(employeeEmergencyContacts.isPrimary), employeeEmergencyContacts.name);
}

export async function createEmergencyContact(data: typeof employeeEmergencyContacts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(employeeEmergencyContacts).values(data);
  return { id: result[0].insertId };
}

export async function updateEmergencyContact(
  id: number,
  data: Partial<typeof employeeEmergencyContacts.$inferInsert>,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(employeeEmergencyContacts).set(data).where(eq(employeeEmergencyContacts.id, id));
}

export async function deleteEmergencyContact(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(employeeEmergencyContacts).where(eq(employeeEmergencyContacts.id, id));
}

// ========================== 
// Transactional operations
// ==========================

/**
 * Atomically create a leave request and adjust the PTO pending balance.
 * Both operations are wrapped in a DB transaction so a balance-adjustment failure
 * cannot leave the request in an orphaned state.
 */
export async function createLeaveRequestWithPtoAdjustment(
  leaveData: typeof leaveRequests.$inferInsert,
  ptoAdjust: { employeeId: number; leaveType: typeof ptoBalances.$inferInsert["leaveType"]; year: number; hours: number },
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const result = await tx.insert(leaveRequests).values(leaveData);
    const existing = await tx
      .select()
      .from(ptoBalances)
      .where(and(
        eq(ptoBalances.employeeId, ptoAdjust.employeeId),
        eq(ptoBalances.leaveType, ptoAdjust.leaveType),
        eq(ptoBalances.year, ptoAdjust.year),
      ))
      .limit(1);
    if (!existing[0]) throw new Error(`No PTO balance record found for employee ${ptoAdjust.employeeId}, leaveType ${ptoAdjust.leaveType}, year ${ptoAdjust.year}`);
    await tx
      .update(ptoBalances)
      .set({ pendingHours: sql`${ptoBalances.pendingHours} + ${ptoAdjust.hours}` })
      .where(eq(ptoBalances.id, existing[0].id));
    return { id: result[0].insertId };
  });
}

/**
 * Atomically update a leave request decision and adjust the PTO used/pending balances.
 */
export async function decideLeaveRequestWithPtoAdjustment(
  requestId: number,
  decision: { status: string; approverId: number; rejectionReason?: string | null },
  ptoAdjust: { employeeId: number; leaveType: typeof ptoBalances.$inferInsert["leaveType"]; year: number; hours: number; approved: boolean },
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    await tx
      .update(leaveRequests)
      .set({ status: decision.status as any, approverId: decision.approverId, approvedAt: new Date(), rejectionReason: decision.rejectionReason })
      .where(eq(leaveRequests.id, requestId));
    const existing = await tx
      .select()
      .from(ptoBalances)
      .where(and(
        eq(ptoBalances.employeeId, ptoAdjust.employeeId),
        eq(ptoBalances.leaveType, ptoAdjust.leaveType),
        eq(ptoBalances.year, ptoAdjust.year),
      ))
      .limit(1);
    if (!existing[0]) throw new Error(`No PTO balance found for employee ${ptoAdjust.employeeId}`);
    if (ptoAdjust.approved) {
      await tx
        .update(ptoBalances)
        .set({
          pendingHours: sql`${ptoBalances.pendingHours} - ${ptoAdjust.hours}`,
          usedHours: sql`${ptoBalances.usedHours} + ${ptoAdjust.hours}`,
        })
        .where(eq(ptoBalances.id, existing[0].id));
    } else {
      await tx
        .update(ptoBalances)
        .set({ pendingHours: sql`${ptoBalances.pendingHours} - ${ptoAdjust.hours}` })
        .where(eq(ptoBalances.id, existing[0].id));
    }
    return { success: true };
  });
}

/**
 * Atomically cancel a leave request and restore PTO pending/used balances.
 */
export async function cancelLeaveRequestWithPtoRestore(
  requestId: number,
  ptoRestore: { employeeId: number; leaveType: typeof ptoBalances.$inferInsert["leaveType"]; year: number; hours: number; wasApproved: boolean },
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    await tx
      .update(leaveRequests)
      .set({ status: "cancelled" as any })
      .where(eq(leaveRequests.id, requestId));
    const existing = await tx
      .select()
      .from(ptoBalances)
      .where(and(
        eq(ptoBalances.employeeId, ptoRestore.employeeId),
        eq(ptoBalances.leaveType, ptoRestore.leaveType),
        eq(ptoBalances.year, ptoRestore.year),
      ))
      .limit(1);
    if (existing[0]) {
      if (ptoRestore.wasApproved) {
        await tx
          .update(ptoBalances)
          .set({ usedHours: sql`${ptoBalances.usedHours} - ${ptoRestore.hours}` })
          .where(eq(ptoBalances.id, existing[0].id));
      } else {
        await tx
          .update(ptoBalances)
          .set({ pendingHours: sql`${ptoBalances.pendingHours} - ${ptoRestore.hours}` })
          .where(eq(ptoBalances.id, existing[0].id));
      }
    }
    return { success: true };
  });
}
