/**
 * HR AI Service
 * AI-powered attrition prediction, compensation benchmarking,
 * performance analysis, and workforce planning
 */
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

const AttritionPredictionSchema = z.object({
  predictions: z.array(z.object({
    employeeId: z.number(),
    employeeName: z.string(),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    riskScore: z.number().min(0).max(100),
    factors: z.array(z.string()),
    recommendedActions: z.array(z.string()),
  })),
  overallAttritionRisk: z.number().min(0).max(100),
  departmentRisks: z.array(z.object({
    department: z.string(),
    riskLevel: z.enum(["low", "medium", "high"]),
    headcount: z.number(),
    atRiskCount: z.number(),
  })),
  summary: z.string(),
});

const CompensationBenchmarkSchema = z.object({
  benchmarks: z.array(z.object({
    employeeId: z.number(),
    employeeName: z.string(),
    currentSalary: z.number(),
    marketLow: z.number(),
    marketMedian: z.number(),
    marketHigh: z.number(),
    positionInMarket: z.enum(["below_market", "at_market", "above_market"]),
    adjustmentRecommendation: z.number(),
    reasoning: z.string(),
  })),
  totalBudgetImpact: z.number(),
  summary: z.string(),
});

const PerformanceInsightsSchema = z.object({
  insights: z.array(z.object({
    employeeId: z.number(),
    employeeName: z.string(),
    performanceScore: z.number().min(0).max(100),
    strengths: z.array(z.string()),
    developmentAreas: z.array(z.string()),
    promotionReadiness: z.enum(["not_ready", "developing", "ready", "overdue"]),
    recommendedTraining: z.array(z.string()),
  })),
  teamHealthScore: z.number().min(0).max(100),
  topPerformers: z.array(z.string()),
  needsAttention: z.array(z.string()),
});

const WorkforcePlanSchema = z.object({
  currentHeadcount: z.number(),
  projectedNeeds: z.array(z.object({
    department: z.string(),
    currentCount: z.number(),
    projectedNeed: z.number(),
    gap: z.number(),
    priority: z.enum(["low", "medium", "high", "critical"]),
    roles: z.array(z.string()),
    timeline: z.string(),
  })),
  costProjection: z.object({
    currentMonthlyCost: z.number(),
    projectedMonthlyCost: z.number(),
    increasePercent: z.number(),
  }),
  recommendations: z.array(z.string()),
});

// ============================================
// TYPES
// ============================================

export type AttritionPrediction = z.infer<typeof AttritionPredictionSchema>;
export type CompensationBenchmark = z.infer<typeof CompensationBenchmarkSchema>;
export type PerformanceInsights = z.infer<typeof PerformanceInsightsSchema>;
export type WorkforcePlan = z.infer<typeof WorkforcePlanSchema>;

// ============================================
// ATTRITION PREDICTION
// ============================================

export async function predictAttrition(params?: {
  companyId?: number;
  departmentId?: number;
}): Promise<AttritionPrediction> {
  const employees = await db.getEmployees({
    companyId: params?.companyId,
    departmentId: params?.departmentId,
    status: "active",
  });
  const departments = await db.getDepartments(params?.companyId);

  const prompt = `Analyze this workforce data and predict employee attrition risk.

EMPLOYEES (${employees.length} active):
${employees.slice(0, 50).map(e => `- ID:${e.id} Name:"${e.firstName} ${e.lastName}" Dept:${e.departmentId || 'N/A'} Title:"${e.position || 'N/A'}" Hired:${e.hireDate} Salary:$${e.salary || 0} Status:${e.status}`).join("\n")}

DEPARTMENTS:
${departments.map(d => `- ID:${d.id} Name:"${d.name}" Head:${d.headCount || 'N/A'}`).join("\n")}

Analyze each employee for attrition risk based on:
1. Tenure (very short or very long without promotion)
2. Compensation relative to peers
3. Department turnover patterns
4. Role/title stagnation

Respond ONLY with valid JSON:
{
  "predictions": [{ "employeeId": number, "employeeName": string, "riskLevel": "low"|"medium"|"high"|"critical", "riskScore": number (0-100), "factors": ["string"], "recommendedActions": ["string"] }],
  "overallAttritionRisk": number (0-100),
  "departmentRisks": [{ "department": string, "riskLevel": "low"|"medium"|"high", "headcount": number, "atRiskCount": number }],
  "summary": string
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an HR analytics expert specializing in workforce retention and attrition prediction. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = AttritionPredictionSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Attrition prediction LLM failed:", e);
  }

  // Fallback: rule-based analysis
  const predictions: AttritionPrediction["predictions"] = [];
  for (const emp of employees) {
    const tenure = emp.hireDate ? (Date.now() - new Date(emp.hireDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000) : 0;
    let riskScore = 30;
    const factors: string[] = [];

    if (tenure < 1) { riskScore += 20; factors.push("New hire - still in adjustment period"); }
    if (tenure > 5) { riskScore += 10; factors.push("Long tenure - may seek new challenges"); }
    if (!emp.salary || parseFloat(String(emp.salary)) < 40000) { riskScore += 15; factors.push("Below-average compensation"); }

    predictions.push({
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      riskLevel: riskScore >= 70 ? "high" : riskScore >= 50 ? "medium" : "low",
      riskScore: Math.min(riskScore, 100),
      factors: factors.length > 0 ? factors : ["Standard retention profile"],
      recommendedActions: riskScore >= 50 ? ["Schedule 1:1 meeting", "Review compensation"] : ["Continue regular check-ins"],
    });
  }

  return {
    predictions,
    overallAttritionRisk: predictions.length > 0 ? Math.round(predictions.reduce((s, p) => s + p.riskScore, 0) / predictions.length) : 0,
    departmentRisks: departments.map(d => ({
      department: d.name,
      riskLevel: "medium" as const,
      headcount: employees.filter(e => e.departmentId === d.id).length,
      atRiskCount: predictions.filter(p => employees.find(e => e.id === p.employeeId)?.departmentId === d.id && p.riskScore >= 50).length,
    })),
    summary: `Analyzed ${employees.length} employees across ${departments.length} departments.`,
  };
}

// ============================================
// COMPENSATION BENCHMARKING
// ============================================

export async function benchmarkCompensation(params?: {
  companyId?: number;
  departmentId?: number;
}): Promise<CompensationBenchmark> {
  const employees = await db.getEmployees({
    companyId: params?.companyId,
    departmentId: params?.departmentId,
    status: "active",
  });

  const prompt = `Analyze employee compensation and provide market benchmarking estimates.

EMPLOYEES:
${employees.slice(0, 50).map(e => `- ID:${e.id} Name:"${e.firstName} ${e.lastName}" Title:"${e.position || 'N/A'}" Salary:$${e.salary || 0} Hired:${e.hireDate}`).join("\n")}

For each employee, estimate market rates based on their title/role and provide recommendations.
Consider typical ranges for similar roles in a mid-size company context.

Respond ONLY with valid JSON:
{
  "benchmarks": [{ "employeeId": number, "employeeName": string, "currentSalary": number, "marketLow": number, "marketMedian": number, "marketHigh": number, "positionInMarket": "below_market"|"at_market"|"above_market", "adjustmentRecommendation": number (dollar amount), "reasoning": string }],
  "totalBudgetImpact": number (total recommended adjustments),
  "summary": string
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a compensation analyst with expertise in market salary benchmarking. Provide realistic market comparisons. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = CompensationBenchmarkSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Compensation benchmarking LLM failed:", e);
  }

  // Fallback
  const benchmarks: CompensationBenchmark["benchmarks"] = employees.map(e => {
    const salary = parseFloat(String(e.salary || 0));
    const marketMedian = salary * 1.05; // Assume slight market premium
    return {
      employeeId: e.id,
      employeeName: `${e.firstName} ${e.lastName}`,
      currentSalary: salary,
      marketLow: Math.round(marketMedian * 0.8),
      marketMedian: Math.round(marketMedian),
      marketHigh: Math.round(marketMedian * 1.2),
      positionInMarket: salary < marketMedian * 0.9 ? "below_market" as const : salary > marketMedian * 1.1 ? "above_market" as const : "at_market" as const,
      adjustmentRecommendation: salary < marketMedian * 0.9 ? Math.round(marketMedian - salary) : 0,
      reasoning: "Estimated based on role and current compensation",
    };
  });

  return {
    benchmarks,
    totalBudgetImpact: benchmarks.reduce((s, b) => s + b.adjustmentRecommendation, 0),
    summary: `Benchmarked ${employees.length} employees. ${benchmarks.filter(b => b.positionInMarket === "below_market").length} below market rate.`,
  };
}

// ============================================
// PERFORMANCE INSIGHTS
// ============================================

export async function analyzePerformance(params?: {
  companyId?: number;
  departmentId?: number;
}): Promise<PerformanceInsights> {
  const employees = await db.getEmployees({
    companyId: params?.companyId,
    departmentId: params?.departmentId,
    status: "active",
  });

  const prompt = `Analyze this workforce and provide performance insights, strengths, development areas, and training recommendations.

EMPLOYEES:
${employees.slice(0, 50).map(e => `- ID:${e.id} Name:"${e.firstName} ${e.lastName}" Title:"${e.position || 'N/A'}" Dept:${e.departmentId || 'N/A'} Hired:${e.hireDate} Salary:$${e.salary || 0}`).join("\n")}

For each employee, assess based on tenure, role level, and career trajectory indicators.

Respond ONLY with valid JSON:
{
  "insights": [{ "employeeId": number, "employeeName": string, "performanceScore": number (0-100), "strengths": ["string"], "developmentAreas": ["string"], "promotionReadiness": "not_ready"|"developing"|"ready"|"overdue", "recommendedTraining": ["string"] }],
  "teamHealthScore": number (0-100),
  "topPerformers": ["employee names"],
  "needsAttention": ["employee names"]
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an organizational psychologist and talent management expert. Provide thoughtful performance assessments. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = PerformanceInsightsSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Performance analysis LLM failed:", e);
  }

  // Fallback
  const insights: PerformanceInsights["insights"] = employees.map(e => {
    const tenure = e.hireDate ? (Date.now() - new Date(e.hireDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000) : 0;
    return {
      employeeId: e.id,
      employeeName: `${e.firstName} ${e.lastName}`,
      performanceScore: 65,
      strengths: ["Team contribution"],
      developmentAreas: ["Needs more data for assessment"],
      promotionReadiness: tenure > 3 ? "developing" as const : "not_ready" as const,
      recommendedTraining: ["Role-specific skill development"],
    };
  });

  return {
    insights,
    teamHealthScore: 65,
    topPerformers: [],
    needsAttention: [],
  };
}

// ============================================
// WORKFORCE PLANNING
// ============================================

export async function planWorkforce(params?: {
  companyId?: number;
  planningHorizonMonths?: number;
}): Promise<WorkforcePlan> {
  const planningMonths = params?.planningHorizonMonths || 12;
  const employees = await db.getEmployees({ companyId: params?.companyId, status: "active" });
  const departments = await db.getDepartments(params?.companyId);
  const orders = await db.getOrders();
  const workOrders = await db.getWorkOrders();

  const prompt = `Create a workforce plan for the next ${planningMonths} months based on this data.

CURRENT WORKFORCE: ${employees.length} employees
BY DEPARTMENT:
${departments.map(d => {
    const deptEmps = employees.filter(e => e.departmentId === d.id);
    const avgSalary = deptEmps.length > 0 ? deptEmps.reduce((s, e) => s + parseFloat(String(e.salary || 0)), 0) / deptEmps.length : 0;
    return `- ${d.name}: ${deptEmps.length} employees, Avg salary: $${avgSalary.toFixed(0)}`;
  }).join("\n")}

BUSINESS INDICATORS:
- Active orders: ${orders.filter(o => o.status === "processing" || o.status === "confirmed").length}
- Open work orders: ${workOrders.filter(wo => wo.status === "in_progress" || wo.status === "planned").length}
- Current monthly payroll: $${employees.reduce((s, e) => s + parseFloat(String(e.salary || 0)) / 12, 0).toFixed(0)}

Respond ONLY with valid JSON:
{
  "currentHeadcount": number,
  "projectedNeeds": [{ "department": string, "currentCount": number, "projectedNeed": number, "gap": number, "priority": "low"|"medium"|"high"|"critical", "roles": ["string"], "timeline": string }],
  "costProjection": { "currentMonthlyCost": number, "projectedMonthlyCost": number, "increasePercent": number },
  "recommendations": ["string"]
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a workforce planning strategist. Provide data-driven headcount projections and hiring plans. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = WorkforcePlanSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Workforce planning LLM failed:", e);
  }

  const monthlyCost = employees.reduce((s, e) => s + parseFloat(String(e.salary || 0)) / 12, 0);
  return {
    currentHeadcount: employees.length,
    projectedNeeds: departments.map(d => ({
      department: d.name,
      currentCount: employees.filter(e => e.departmentId === d.id).length,
      projectedNeed: employees.filter(e => e.departmentId === d.id).length,
      gap: 0,
      priority: "low" as const,
      roles: [],
      timeline: `${planningMonths} months`,
    })),
    costProjection: {
      currentMonthlyCost: Math.round(monthlyCost),
      projectedMonthlyCost: Math.round(monthlyCost),
      increasePercent: 0,
    },
    recommendations: ["Collect more operational data for accurate workforce projections"],
  };
}
