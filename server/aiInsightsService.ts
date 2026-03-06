/**
 * AI Insights Service
 *
 * Provides AI-powered analysis for ERP modules that previously lacked
 * AI integration: HR, Legal, Finance Reporting, Projects, and Data Rooms.
 */

import { invokeLLM } from "./_core/llm";
import * as db from "./db";

// ============================================
// HR & PAYROLL AI INSIGHTS
// ============================================

export interface HRInsights {
  headcountSummary: string;
  attritionRisk: { employeeId: number; name: string; riskLevel: string; reason: string }[];
  compensationAnalysis: string;
  departmentHealth: { department: string; headcount: number; avgTenure: number; insight: string }[];
  recommendations: string[];
}

export async function generateHRInsights(): Promise<HRInsights> {
  const employees = await db.getEmployees();
  const departments = await db.getDepartments();
  const payments = await db.getEmployeePayments();

  const now = new Date();
  const activeEmployees = employees.filter(e => e.status === "active");
  const recentTerminations = employees.filter(
    e => e.status === "terminated" && e.terminationDate &&
    (now.getTime() - new Date(e.terminationDate).getTime()) < 180 * 24 * 60 * 60 * 1000
  );

  // Build department stats
  const deptStats = departments.map(d => {
    const deptEmployees = activeEmployees.filter(e => e.departmentId === d.id);
    const avgTenure = deptEmployees.length > 0
      ? deptEmployees.reduce((sum, e) => {
          const hire = e.hireDate ? new Date(e.hireDate) : now;
          return sum + (now.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        }, 0) / deptEmployees.length
      : 0;
    return { name: d.name, headcount: deptEmployees.length, avgTenure: Math.round(avgTenure * 10) / 10 };
  });

  const totalPayroll = payments
    .filter(p => p.status === "processed")
    .reduce((s, p) => s + parseFloat(p.amount?.toString() || "0"), 0);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an HR analytics AI. Analyze workforce data and provide actionable insights. Be specific and data-driven.",
      },
      {
        role: "user",
        content: `Analyze this HR data:
- Total active employees: ${activeEmployees.length}
- Recent terminations (6mo): ${recentTerminations.length}
- Departments: ${JSON.stringify(deptStats)}
- Employee types: ${JSON.stringify(countBy(activeEmployees, "employmentType"))}
- Total payroll processed: $${totalPayroll.toFixed(2)}
- Employees on leave: ${employees.filter(e => e.status === "on_leave").length}

Employees by tenure (years since hire):
${activeEmployees.slice(0, 30).map(e => `- ${e.firstName} ${e.lastName} (${e.jobTitle || "N/A"}, ${e.employmentType}, hired ${e.hireDate ? new Date(e.hireDate).toLocaleDateString() : "unknown"})`).join("\n")}

Respond with JSON:
{
  "headcountSummary": "overview of workforce",
  "attritionRisk": [{"employeeId": 0, "name": "name", "riskLevel": "low|medium|high", "reason": "why"}],
  "compensationAnalysis": "payroll analysis",
  "departmentHealth": [{"department": "name", "headcount": 0, "avgTenure": 0, "insight": "observation"}],
  "recommendations": ["action item 1", "action item 2"]
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "hr_insights",
        strict: true,
        schema: {
          type: "object",
          properties: {
            headcountSummary: { type: "string" },
            attritionRisk: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  employeeId: { type: "number" },
                  name: { type: "string" },
                  riskLevel: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["employeeId", "name", "riskLevel", "reason"],
                additionalProperties: false,
              },
            },
            compensationAnalysis: { type: "string" },
            departmentHealth: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  department: { type: "string" },
                  headcount: { type: "number" },
                  avgTenure: { type: "number" },
                  insight: { type: "string" },
                },
                required: ["department", "headcount", "avgTenure", "insight"],
                additionalProperties: false,
              },
            },
            recommendations: { type: "array", items: { type: "string" } },
          },
          required: ["headcountSummary", "attritionRisk", "compensationAnalysis", "departmentHealth", "recommendations"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  return JSON.parse(typeof content === "string" ? content : "{}");
}

// ============================================
// LEGAL & CONTRACT AI INSIGHTS
// ============================================

export interface LegalInsights {
  contractSummary: string;
  expiringContracts: { id: number; title: string; endDate: string; daysUntilExpiry: number; recommendation: string }[];
  riskAssessment: { category: string; riskLevel: string; description: string }[];
  disputeAnalysis: string;
  recommendations: string[];
}

export async function generateLegalInsights(): Promise<LegalInsights> {
  const contracts = await db.getContracts();
  const disputes = await db.getDisputes();
  const now = new Date();

  const activeContracts = contracts.filter(c => c.status === "active");
  const expiringWithin90Days = activeContracts.filter(c => {
    if (!c.endDate) return false;
    const daysLeft = (new Date(c.endDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    return daysLeft > 0 && daysLeft <= 90;
  });

  const openDisputes = disputes.filter(d => ["open", "investigating", "negotiating", "escalated"].includes(d.status));
  const totalDisputeValue = openDisputes.reduce((s, d) => s + parseFloat(d.estimatedValue?.toString() || "0"), 0);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are a legal analytics AI for an ERP system. Analyze contracts and disputes to identify risks and provide recommendations.",
      },
      {
        role: "user",
        content: `Analyze this legal data:

Contracts:
- Total: ${contracts.length} (Active: ${activeContracts.length})
- Expiring within 90 days: ${expiringWithin90Days.length}
- By type: ${JSON.stringify(countBy(contracts, "type"))}
- By status: ${JSON.stringify(countBy(contracts, "status"))}
- Auto-renewal enabled: ${contracts.filter(c => c.autoRenewal).length}

Expiring contracts:
${expiringWithin90Days.slice(0, 10).map(c => `- ${c.title} (${c.type}): expires ${c.endDate ? new Date(c.endDate).toLocaleDateString() : "unknown"}, value $${c.value || "0"}, auto-renew: ${c.autoRenewal}`).join("\n")}

Disputes:
- Open: ${openDisputes.length}
- Total estimated value at risk: $${totalDisputeValue.toFixed(2)}
- By priority: ${JSON.stringify(countBy(openDisputes, "priority"))}
- By type: ${JSON.stringify(countBy(openDisputes, "type"))}

Respond with JSON:
{
  "contractSummary": "overview",
  "expiringContracts": [{"id": 0, "title": "name", "endDate": "date", "daysUntilExpiry": 0, "recommendation": "action"}],
  "riskAssessment": [{"category": "area", "riskLevel": "low|medium|high", "description": "detail"}],
  "disputeAnalysis": "summary of disputes",
  "recommendations": ["action 1", "action 2"]
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "legal_insights",
        strict: true,
        schema: {
          type: "object",
          properties: {
            contractSummary: { type: "string" },
            expiringContracts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  title: { type: "string" },
                  endDate: { type: "string" },
                  daysUntilExpiry: { type: "number" },
                  recommendation: { type: "string" },
                },
                required: ["id", "title", "endDate", "daysUntilExpiry", "recommendation"],
                additionalProperties: false,
              },
            },
            riskAssessment: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  riskLevel: { type: "string" },
                  description: { type: "string" },
                },
                required: ["category", "riskLevel", "description"],
                additionalProperties: false,
              },
            },
            disputeAnalysis: { type: "string" },
            recommendations: { type: "array", items: { type: "string" } },
          },
          required: ["contractSummary", "expiringContracts", "riskAssessment", "disputeAnalysis", "recommendations"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  return JSON.parse(typeof content === "string" ? content : "{}");
}

// ============================================
// AI CONTRACT ANALYSIS
// ============================================

export interface ContractAnalysis {
  summary: string;
  keyTerms: string[];
  risks: { risk: string; severity: string; mitigation: string }[];
  obligations: string[];
  renewalRecommendation: string;
}

export async function analyzeContract(contractId: number): Promise<ContractAnalysis> {
  const contract = await db.getContractById(contractId);
  if (!contract) throw new Error("Contract not found");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are a legal contract analyst AI. Analyze the contract terms and identify risks, obligations, and key provisions.",
      },
      {
        role: "user",
        content: `Analyze this contract:
Title: ${contract.title}
Type: ${contract.type}
Party: ${contract.partyName || "Unknown"}
Value: $${contract.value || "0"} ${contract.currency || "USD"}
Start: ${contract.startDate ? new Date(contract.startDate).toLocaleDateString() : "N/A"}
End: ${contract.endDate ? new Date(contract.endDate).toLocaleDateString() : "N/A"}
Auto-Renewal: ${contract.autoRenewal ? "Yes" : "No"}
Terms: ${contract.terms || "Not specified"}
Description: ${contract.description || "Not specified"}

Respond with JSON:
{
  "summary": "contract overview",
  "keyTerms": ["term 1", "term 2"],
  "risks": [{"risk": "description", "severity": "low|medium|high", "mitigation": "suggestion"}],
  "obligations": ["obligation 1"],
  "renewalRecommendation": "should renew/renegotiate/terminate and why"
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "contract_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            keyTerms: { type: "array", items: { type: "string" } },
            risks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  risk: { type: "string" },
                  severity: { type: "string" },
                  mitigation: { type: "string" },
                },
                required: ["risk", "severity", "mitigation"],
                additionalProperties: false,
              },
            },
            obligations: { type: "array", items: { type: "string" } },
            renewalRecommendation: { type: "string" },
          },
          required: ["summary", "keyTerms", "risks", "obligations", "renewalRecommendation"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  return JSON.parse(typeof content === "string" ? content : "{}");
}

// ============================================
// FINANCIAL REPORTING AI INSIGHTS
// ============================================

export interface FinancialInsights {
  overview: string;
  revenueAnalysis: string;
  expenseAnalysis: string;
  cashFlowStatus: string;
  arAgingSummary: string;
  apAgingSummary: string;
  kpis: { name: string; value: string; trend: string; insight: string }[];
  recommendations: string[];
}

export async function generateFinancialInsights(): Promise<FinancialInsights> {
  const allInvoices = await db.getInvoices();
  const allPayments = await db.getPayments();
  const accounts = await db.getAccounts();
  const allTransactions = await db.getTransactions();

  const now = new Date();

  // Revenue (paid invoices)
  const paidInvoices = allInvoices.filter(i => i.status === "paid");
  const totalRevenue = paidInvoices.reduce((s, i) => s + parseFloat(i.totalAmount || "0"), 0);

  // Outstanding AR
  const outstandingInvoices = allInvoices.filter(i => ["pending", "sent"].includes(i.status));
  const totalAR = outstandingInvoices.reduce((s, i) => s + parseFloat(i.totalAmount || "0"), 0);
  const overdueAR = outstandingInvoices.filter(i => i.dueDate && new Date(i.dueDate) < now);
  const overdueARAmount = overdueAR.reduce((s, i) => s + parseFloat(i.totalAmount || "0"), 0);

  // Payments made (AP)
  const totalAP = allPayments
    .filter(p => p.status === "completed")
    .reduce((s, p) => s + parseFloat(p.amount || "0"), 0);

  // Cash position from accounts
  const cashAccounts = accounts.filter(a => a.type === "asset" || a.subtype === "bank");
  const cashBalance = cashAccounts.reduce((s, a) => s + parseFloat(a.balance?.toString() || "0"), 0);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are a CFO-level financial AI analyst. Provide executive-quality financial insights based on ERP data.",
      },
      {
        role: "user",
        content: `Analyze this financial data:

Revenue: $${totalRevenue.toFixed(2)} (from ${paidInvoices.length} paid invoices)
Accounts Receivable: $${totalAR.toFixed(2)} (${outstandingInvoices.length} outstanding invoices)
Overdue AR: $${overdueARAmount.toFixed(2)} (${overdueAR.length} invoices)
Payments Made: $${totalAP.toFixed(2)}
Cash Position: $${cashBalance.toFixed(2)}
Total Accounts: ${accounts.length}
Total Transactions: ${allTransactions.length}
Invoice statuses: ${JSON.stringify(countBy(allInvoices, "status"))}

Respond with JSON:
{
  "overview": "executive financial summary",
  "revenueAnalysis": "revenue trends and analysis",
  "expenseAnalysis": "expense and AP analysis",
  "cashFlowStatus": "cash flow health assessment",
  "arAgingSummary": "accounts receivable aging analysis",
  "apAgingSummary": "accounts payable analysis",
  "kpis": [{"name": "KPI name", "value": "metric", "trend": "up|down|stable", "insight": "what it means"}],
  "recommendations": ["action 1", "action 2"]
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "financial_insights",
        strict: true,
        schema: {
          type: "object",
          properties: {
            overview: { type: "string" },
            revenueAnalysis: { type: "string" },
            expenseAnalysis: { type: "string" },
            cashFlowStatus: { type: "string" },
            arAgingSummary: { type: "string" },
            apAgingSummary: { type: "string" },
            kpis: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  value: { type: "string" },
                  trend: { type: "string" },
                  insight: { type: "string" },
                },
                required: ["name", "value", "trend", "insight"],
                additionalProperties: false,
              },
            },
            recommendations: { type: "array", items: { type: "string" } },
          },
          required: ["overview", "revenueAnalysis", "expenseAnalysis", "cashFlowStatus", "arAgingSummary", "apAgingSummary", "kpis", "recommendations"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  return JSON.parse(typeof content === "string" ? content : "{}");
}

// ============================================
// PROJECT AI INSIGHTS
// ============================================

export interface ProjectInsights {
  portfolioSummary: string;
  atRiskProjects: { id: number; name: string; riskLevel: string; reason: string; recommendation: string }[];
  budgetAnalysis: string;
  timelineAnalysis: string;
  resourceRecommendations: string[];
  recommendations: string[];
}

export async function generateProjectInsights(): Promise<ProjectInsights> {
  const projects = await db.getProjects();
  const now = new Date();

  const activeProjects = projects.filter(p => p.status === "active");
  const totalBudget = projects.reduce((s, p) => s + parseFloat(p.budget?.toString() || "0"), 0);
  const totalActualCost = projects.reduce((s, p) => s + parseFloat(p.actualCost?.toString() || "0"), 0);

  const overdueProjects = activeProjects.filter(p =>
    p.targetEndDate && new Date(p.targetEndDate) < now
  );

  const overBudgetProjects = activeProjects.filter(p => {
    const budget = parseFloat(p.budget?.toString() || "0");
    const actual = parseFloat(p.actualCost?.toString() || "0");
    return budget > 0 && actual > budget;
  });

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are a project management AI analyst. Analyze project portfolio data and identify risks, delays, and optimization opportunities.",
      },
      {
        role: "user",
        content: `Analyze this project portfolio:

Total projects: ${projects.length}
By status: ${JSON.stringify(countBy(projects, "status"))}
By priority: ${JSON.stringify(countBy(projects, "priority"))}
By type: ${JSON.stringify(countBy(projects, "type"))}
Total budget: $${totalBudget.toFixed(2)}
Total actual cost: $${totalActualCost.toFixed(2)}
Overdue: ${overdueProjects.length}
Over budget: ${overBudgetProjects.length}

Active projects:
${activeProjects.slice(0, 15).map(p => `- ${p.name} (${p.type}, ${p.priority}): ${p.progress || 0}% complete, budget $${p.budget || "0"}, actual $${p.actualCost || "0"}, target end: ${p.targetEndDate ? new Date(p.targetEndDate).toLocaleDateString() : "none"}`).join("\n")}

Respond with JSON:
{
  "portfolioSummary": "executive summary",
  "atRiskProjects": [{"id": 0, "name": "project", "riskLevel": "low|medium|high", "reason": "why", "recommendation": "what to do"}],
  "budgetAnalysis": "budget health",
  "timelineAnalysis": "timeline assessment",
  "resourceRecommendations": ["suggestion 1"],
  "recommendations": ["action 1", "action 2"]
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "project_insights",
        strict: true,
        schema: {
          type: "object",
          properties: {
            portfolioSummary: { type: "string" },
            atRiskProjects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  name: { type: "string" },
                  riskLevel: { type: "string" },
                  reason: { type: "string" },
                  recommendation: { type: "string" },
                },
                required: ["id", "name", "riskLevel", "reason", "recommendation"],
                additionalProperties: false,
              },
            },
            budgetAnalysis: { type: "string" },
            timelineAnalysis: { type: "string" },
            resourceRecommendations: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } },
          },
          required: ["portfolioSummary", "atRiskProjects", "budgetAnalysis", "timelineAnalysis", "resourceRecommendations", "recommendations"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  return JSON.parse(typeof content === "string" ? content : "{}");
}

// ============================================
// DATA ROOM AI INSIGHTS
// ============================================

export interface DataRoomInsights {
  summary: string;
  documentClassification: { category: string; count: number; suggestion: string }[];
  missingDocuments: string[];
  accessPatterns: string;
  recommendations: string[];
}

export async function generateDataRoomInsights(dataRoomId?: number): Promise<DataRoomInsights> {
  const documents = await db.getDocuments();
  const dataRooms = await db.getDataRooms();

  const docsByType = countBy(documents, "type");
  const docsByCategory = countBy(documents, "category");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are a document management AI. Analyze the data room and document library to suggest improvements, identify gaps, and recommend organizational changes.",
      },
      {
        role: "user",
        content: `Analyze this document management data:

Total documents: ${documents.length}
Data rooms: ${dataRooms.length}
Documents by type: ${JSON.stringify(docsByType)}
Documents by category: ${JSON.stringify(docsByCategory)}

Recent documents (last 20):
${documents.slice(0, 20).map(d => `- ${d.name} (${d.type}, ${d.category || "uncategorized"}, ${d.mimeType || "unknown"})`).join("\n")}

Data rooms:
${dataRooms.slice(0, 10).map(dr => `- ${dr.name}: ${dr.description || "no description"}`).join("\n")}

Respond with JSON:
{
  "summary": "document management overview",
  "documentClassification": [{"category": "type", "count": 0, "suggestion": "improvement idea"}],
  "missingDocuments": ["document type that should exist but doesn't"],
  "accessPatterns": "observations about document organization",
  "recommendations": ["action 1", "action 2"]
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "dataroom_insights",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            documentClassification: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  count: { type: "number" },
                  suggestion: { type: "string" },
                },
                required: ["category", "count", "suggestion"],
                additionalProperties: false,
              },
            },
            missingDocuments: { type: "array", items: { type: "string" } },
            accessPatterns: { type: "string" },
            recommendations: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "documentClassification", "missingDocuments", "accessPatterns", "recommendations"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  return JSON.parse(typeof content === "string" ? content : "{}");
}

// ============================================
// HELPERS
// ============================================

function countBy<T>(arr: T[], key: keyof T): Record<string, number> {
  return arr.reduce((acc, item) => {
    const val = String(item[key] || "unknown");
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
