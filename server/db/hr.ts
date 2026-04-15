import { eq, and, desc } from "drizzle-orm";
import { departments, employees, InsertEmployee, compensationHistory, employeePayments } from "../../drizzle/schema";
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
