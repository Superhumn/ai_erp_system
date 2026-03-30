import { eq, and, desc } from "drizzle-orm";
import { projects, InsertProject, projectMilestones, projectTasks, investmentGrantChecklists, InsertInvestmentGrantChecklist, investmentGrantItems, InsertInvestmentGrantItem } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getProjects(filters?: { companyId?: number; status?: string; ownerId?: number }) {
  const db = await getDb(); if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(projects.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(projects.status, filters.status as any));
  if (filters?.ownerId) conditions.push(eq(projects.ownerId, filters.ownerId));
  if (conditions.length > 0) { return db.select().from(projects).where(and(...conditions)).orderBy(desc(projects.createdAt)); }
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}
export async function getProjectById(id: number) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1); return result[0]; }
export async function getProjectWithDetails(id: number) { const db = await getDb(); if (!db) return undefined; const project = await getProjectById(id); if (!project) return undefined; const milestones = await db.select().from(projectMilestones).where(eq(projectMilestones.projectId, id)).orderBy(projectMilestones.dueDate); const tasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, id)).orderBy(desc(projectTasks.createdAt)); return { ...project, milestones, tasks }; }
export async function createProject(data: InsertProject) { const db = await getDb(); if (!db) throw new Error("Database not available"); const result = await db.insert(projects).values(data); return { id: result[0].insertId }; }
export async function updateProject(id: number, data: Partial<InsertProject>) { const db = await getDb(); if (!db) return; await db.update(projects).set(data).where(eq(projects.id, id)); }
export async function createProjectMilestone(data: typeof projectMilestones.$inferInsert) { const db = await getDb(); if (!db) throw new Error("Database not available"); const result = await db.insert(projectMilestones).values(data); return { id: result[0].insertId }; }
export async function updateProjectMilestone(id: number, data: Partial<typeof projectMilestones.$inferInsert>) { const db = await getDb(); if (!db) return; await db.update(projectMilestones).set(data).where(eq(projectMilestones.id, id)); }
export async function createProjectTask(data: typeof projectTasks.$inferInsert) { const db = await getDb(); if (!db) throw new Error("Database not available"); const result = await db.insert(projectTasks).values(data); return { id: result[0].insertId }; }
export async function updateProjectTask(id: number, data: Partial<typeof projectTasks.$inferInsert>) { const db = await getDb(); if (!db) return; await db.update(projectTasks).set(data).where(eq(projectTasks.id, id)); }
export async function getProjectTasks(projectId: number) { const db = await getDb(); if (!db) return []; return db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId)).orderBy(desc(projectTasks.createdAt)); }

// ============================================
// INVESTMENT GRANT CHECKLISTS
// ============================================
export async function getInvestmentGrantChecklists(filters?: { companyId?: number; status?: typeof investmentGrantChecklists.$inferSelect["status"] }) {
  const db = await getDb(); if (!db) return [];
  const conditions = [];
  if (filters?.companyId) conditions.push(eq(investmentGrantChecklists.companyId, filters.companyId));
  if (filters?.status) conditions.push(eq(investmentGrantChecklists.status, filters.status));
  if (conditions.length > 0) { return db.select().from(investmentGrantChecklists).where(and(...conditions)).orderBy(desc(investmentGrantChecklists.createdAt)); }
  return db.select().from(investmentGrantChecklists).orderBy(desc(investmentGrantChecklists.createdAt));
}
export async function getInvestmentGrantChecklistById(id: number) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(investmentGrantChecklists).where(eq(investmentGrantChecklists.id, id)).limit(1); return result[0]; }
export async function getInvestmentGrantChecklistWithItems(id: number) { const db = await getDb(); if (!db) return undefined; const checklist = await getInvestmentGrantChecklistById(id); if (!checklist) return undefined; const items = await db.select().from(investmentGrantItems).where(eq(investmentGrantItems.checklistId, id)).orderBy(investmentGrantItems.sortOrder); return { ...checklist, items }; }
export async function createInvestmentGrantChecklist(data: InsertInvestmentGrantChecklist) { const db = await getDb(); if (!db) throw new Error("Database not available"); const result = await db.insert(investmentGrantChecklists).values(data); return { id: result[0].insertId }; }
export async function updateInvestmentGrantChecklist(id: number, data: Partial<InsertInvestmentGrantChecklist>) { const db = await getDb(); if (!db) return; await db.update(investmentGrantChecklists).set(data).where(eq(investmentGrantChecklists.id, id)); }
export async function createInvestmentGrantItem(data: InsertInvestmentGrantItem) { const db = await getDb(); if (!db) throw new Error("Database not available"); const result = await db.insert(investmentGrantItems).values(data); return { id: result[0].insertId }; }
export async function updateInvestmentGrantItem(id: number, data: Partial<InsertInvestmentGrantItem>) { const db = await getDb(); if (!db) return; await db.update(investmentGrantItems).set(data).where(eq(investmentGrantItems.id, id)); }
export async function getInvestmentGrantItems(checklistId: number) { const db = await getDb(); if (!db) return []; return db.select().from(investmentGrantItems).where(eq(investmentGrantItems.checklistId, checklistId)).orderBy(investmentGrantItems.sortOrder); }
