/**
 * Projects AI Service
 * AI-powered effort estimation, resource allocation,
 * risk prediction, and schedule optimization
 */
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

const EffortEstimationSchema = z.object({
  estimates: z.array(z.object({
    taskId: z.number().optional().nullable(),
    taskName: z.string(),
    estimatedHours: z.number(),
    confidenceRange: z.object({
      optimistic: z.number(),
      mostLikely: z.number(),
      pessimistic: z.number(),
    }),
    complexityLevel: z.enum(["low", "medium", "high", "very_high"]),
    assumptions: z.array(z.string()),
    risks: z.array(z.string()),
  })),
  totalEstimatedHours: z.number(),
  summary: z.string(),
});

const ResourceAllocationSchema = z.object({
  allocations: z.array(z.object({
    projectId: z.number(),
    projectName: z.string(),
    currentAllocation: z.number(),
    recommendedAllocation: z.number(),
    reasoning: z.string(),
    suggestedTeamSize: z.number(),
    skillsNeeded: z.array(z.string()),
  })),
  overutilized: z.array(z.string()),
  underutilized: z.array(z.string()),
  recommendations: z.array(z.string()),
});

const ProjectRiskSchema = z.object({
  risks: z.array(z.object({
    projectId: z.number(),
    projectName: z.string(),
    overallRiskScore: z.number().min(0).max(100),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    riskFactors: z.array(z.object({
      category: z.string(),
      description: z.string(),
      probability: z.enum(["low", "medium", "high"]),
      impact: z.enum(["low", "medium", "high"]),
      mitigation: z.string(),
    })),
    scheduleRisk: z.enum(["on_track", "at_risk", "delayed"]),
    budgetRisk: z.enum(["on_track", "at_risk", "over_budget"]),
  })),
  portfolioRiskScore: z.number().min(0).max(100),
  criticalProjects: z.array(z.string()),
  summary: z.string(),
});

const ScheduleOptimizationSchema = z.object({
  optimizedSchedule: z.array(z.object({
    projectId: z.number(),
    projectName: z.string(),
    recommendedStartDate: z.string(),
    recommendedEndDate: z.string(),
    criticalPath: z.array(z.string()),
    parallelizableWith: z.array(z.string()),
  })),
  totalDurationWeeks: z.number(),
  savingsVsCurrent: z.string(),
  recommendations: z.array(z.string()),
});

// ============================================
// TYPES
// ============================================

export type EffortEstimation = z.infer<typeof EffortEstimationSchema>;
export type ResourceAllocation = z.infer<typeof ResourceAllocationSchema>;
export type ProjectRisk = z.infer<typeof ProjectRiskSchema>;
export type ScheduleOptimization = z.infer<typeof ScheduleOptimizationSchema>;

// ============================================
// EFFORT ESTIMATION
// ============================================

export async function estimateEffort(params: {
  projectId: number;
}): Promise<EffortEstimation> {
  const project = await db.getProjectById(params.projectId);
  if (!project) throw new Error("Project not found");

  const tasks = await db.getProjectTasks(params.projectId);
  const milestones = await db.getProjectMilestones(params.projectId);

  const prompt = `Estimate effort for this project and its tasks.

PROJECT:
- ID: ${project.id}
- Name: "${project.name}"
- Status: ${project.status}
- Start: ${project.startDate || 'N/A'}
- End: ${project.endDate || 'N/A'}
- Budget: $${project.budget || 'N/A'}
- Description: "${project.description || 'N/A'}"

MILESTONES (${milestones.length}):
${milestones.map(m => `- "${m.title}" Due:${m.dueDate || 'N/A'} Status:${m.status}`).join("\n") || "No milestones"}

TASKS (${tasks.length}):
${tasks.map(t => `- ID:${t.id} "${t.title}" Status:${t.status} Priority:${t.priority || 'N/A'} Assignee:${t.assigneeId || 'Unassigned'} Due:${t.dueDate || 'N/A'}`).join("\n") || "No tasks"}

Estimate hours for each task using three-point estimation (optimistic, most likely, pessimistic).

Respond ONLY with valid JSON:
{
  "estimates": [{ "taskId": number|null, "taskName": string, "estimatedHours": number, "confidenceRange": { "optimistic": number, "mostLikely": number, "pessimistic": number }, "complexityLevel": "low"|"medium"|"high"|"very_high", "assumptions": ["string"], "risks": ["string"] }],
  "totalEstimatedHours": number,
  "summary": string
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a project management expert skilled in effort estimation and work breakdown. Provide realistic estimates with proper uncertainty ranges. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = EffortEstimationSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Effort estimation LLM failed:", e);
  }

  // Fallback
  const estimates: EffortEstimation["estimates"] = tasks.map(t => ({
    taskId: t.id,
    taskName: t.title,
    estimatedHours: 8,
    confidenceRange: { optimistic: 4, mostLikely: 8, pessimistic: 16 },
    complexityLevel: "medium" as const,
    assumptions: ["Standard task complexity"],
    risks: ["Estimate based on defaults - refine with domain knowledge"],
  }));

  return {
    estimates,
    totalEstimatedHours: estimates.reduce((s, e) => s + e.estimatedHours, 0),
    summary: `Default estimates for ${tasks.length} tasks. Refine with actual complexity assessment.`,
  };
}

// ============================================
// RESOURCE ALLOCATION
// ============================================

export async function optimizeResourceAllocation(params?: {
  companyId?: number;
}): Promise<ResourceAllocation> {
  const projects = await db.getProjects({ companyId: params?.companyId });
  const activeProjects = projects.filter(p => p.status === "active" || p.status === "in_progress");
  const employees = await db.getEmployees({ companyId: params?.companyId, status: "active" });

  const prompt = `Optimize resource allocation across these active projects.

ACTIVE PROJECTS (${activeProjects.length}):
${activeProjects.map(p => `- ID:${p.id} "${p.name}" Status:${p.status} Budget:$${p.budget || 'N/A'} Owner:${p.ownerId || 'N/A'} End:${p.endDate || 'N/A'}`).join("\n")}

AVAILABLE TEAM: ${employees.length} employees
${employees.slice(0, 20).map(e => `- ${e.firstName} ${e.lastName}: ${e.position || 'N/A'} (Dept: ${e.departmentId || 'N/A'})`).join("\n")}

Recommend optimal resource distribution considering project priorities, deadlines, and team capabilities.

Respond ONLY with valid JSON:
{
  "allocations": [{ "projectId": number, "projectName": string, "currentAllocation": number (headcount), "recommendedAllocation": number, "reasoning": string, "suggestedTeamSize": number, "skillsNeeded": ["string"] }],
  "overutilized": ["project names that are over-resourced"],
  "underutilized": ["project names that need more resources"],
  "recommendations": ["string"]
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a resource management expert. Optimize team allocation across multiple projects for maximum efficiency. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = ResourceAllocationSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Resource allocation LLM failed:", e);
  }

  return {
    allocations: activeProjects.map(p => ({
      projectId: p.id,
      projectName: p.name,
      currentAllocation: 1,
      recommendedAllocation: 1,
      reasoning: "Default allocation - requires detailed project analysis",
      suggestedTeamSize: 1,
      skillsNeeded: ["Project-specific skills"],
    })),
    overutilized: [],
    underutilized: [],
    recommendations: ["Define project requirements for better resource optimization"],
  };
}

// ============================================
// PROJECT RISK PREDICTION
// ============================================

export async function predictProjectRisks(params?: {
  companyId?: number;
  projectId?: number;
}): Promise<ProjectRisk> {
  const projects = await db.getProjects({ companyId: params?.companyId });
  const targetProjects = params?.projectId
    ? projects.filter(p => p.id === params.projectId)
    : projects.filter(p => p.status === "active" || p.status === "in_progress");

  const prompt = `Assess risk levels for these projects.

PROJECTS (${targetProjects.length}):
${targetProjects.map(p => `- ID:${p.id} "${p.name}" Status:${p.status} Budget:$${p.budget || 'N/A'} Start:${p.startDate || 'N/A'} End:${p.endDate || 'N/A'} Owner:${p.ownerId || 'N/A'}`).join("\n")}

Today: ${new Date().toISOString().slice(0, 10)}

Analyze each project for schedule, budget, scope, and resource risks.

Respond ONLY with valid JSON:
{
  "risks": [{ "projectId": number, "projectName": string, "overallRiskScore": number (0-100), "riskLevel": "low"|"medium"|"high"|"critical", "riskFactors": [{ "category": string, "description": string, "probability": "low"|"medium"|"high", "impact": "low"|"medium"|"high", "mitigation": string }], "scheduleRisk": "on_track"|"at_risk"|"delayed", "budgetRisk": "on_track"|"at_risk"|"over_budget" }],
  "portfolioRiskScore": number (0-100),
  "criticalProjects": ["project names"],
  "summary": string
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a project risk management expert. Identify, assess, and prioritize project risks with practical mitigation strategies. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = ProjectRiskSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Project risk prediction LLM failed:", e);
  }

  return {
    risks: targetProjects.map(p => {
      const hasEndDate = !!p.endDate;
      const daysLeft = p.endDate ? (new Date(p.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000) : 999;
      return {
        projectId: p.id,
        projectName: p.name,
        overallRiskScore: daysLeft < 14 ? 70 : 30,
        riskLevel: daysLeft < 14 ? "high" as const : "low" as const,
        riskFactors: [
          ...(daysLeft < 14 ? [{ category: "Schedule", description: "Less than 2 weeks to deadline", probability: "high" as const, impact: "high" as const, mitigation: "Review scope and prioritize critical deliverables" }] : []),
          ...(!hasEndDate ? [{ category: "Planning", description: "No end date defined", probability: "medium" as const, impact: "medium" as const, mitigation: "Define project timeline and milestones" }] : []),
        ],
        scheduleRisk: daysLeft < 14 ? "at_risk" as const : "on_track" as const,
        budgetRisk: "on_track" as const,
      };
    }),
    portfolioRiskScore: 30,
    criticalProjects: targetProjects.filter(p => p.endDate && (new Date(p.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000) < 14).map(p => p.name),
    summary: `Analyzed ${targetProjects.length} projects with basic risk indicators.`,
  };
}

// ============================================
// SCHEDULE OPTIMIZATION
// ============================================

export async function optimizeSchedule(params?: {
  companyId?: number;
}): Promise<ScheduleOptimization> {
  const projects = await db.getProjects({ companyId: params?.companyId });
  const activeProjects = projects.filter(p => p.status === "active" || p.status === "in_progress" || p.status === "planned");

  const prompt = `Optimize the schedule across these projects for maximum efficiency.

PROJECTS (${activeProjects.length}):
${activeProjects.map(p => `- ID:${p.id} "${p.name}" Status:${p.status} Start:${p.startDate || 'N/A'} End:${p.endDate || 'N/A'} Budget:$${p.budget || 'N/A'}`).join("\n")}

Today: ${new Date().toISOString().slice(0, 10)}

Identify critical paths, parallelizable work, and schedule optimization opportunities.

Respond ONLY with valid JSON:
{
  "optimizedSchedule": [{ "projectId": number, "projectName": string, "recommendedStartDate": string, "recommendedEndDate": string, "criticalPath": ["milestone/task names"], "parallelizableWith": ["project names"] }],
  "totalDurationWeeks": number,
  "savingsVsCurrent": string,
  "recommendations": ["string"]
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a project scheduling expert. Optimize multi-project schedules using critical path analysis. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = ScheduleOptimizationSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Schedule optimization LLM failed:", e);
  }

  return {
    optimizedSchedule: activeProjects.map(p => ({
      projectId: p.id,
      projectName: p.name,
      recommendedStartDate: p.startDate?.toString() || new Date().toISOString().slice(0, 10),
      recommendedEndDate: p.endDate?.toString() || "TBD",
      criticalPath: ["Define milestones for critical path analysis"],
      parallelizableWith: [],
    })),
    totalDurationWeeks: 0,
    savingsVsCurrent: "Insufficient data for comparison",
    recommendations: ["Define detailed task dependencies for schedule optimization"],
  };
}
