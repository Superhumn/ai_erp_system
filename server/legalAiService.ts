/**
 * Legal AI Service
 * AI-powered contract analysis, risk flagging, clause extraction,
 * dispute prediction, and compliance monitoring
 */
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

const ContractAnalysisSchema = z.object({
  contractId: z.number(),
  riskScore: z.number().min(0).max(100),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  keyTerms: z.array(z.object({
    term: z.string(),
    value: z.string(),
    favorability: z.enum(["favorable", "neutral", "unfavorable"]),
    notes: z.string(),
  })),
  risks: z.array(z.object({
    category: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]),
    description: z.string(),
    mitigation: z.string(),
  })),
  missingClauses: z.array(z.string()),
  recommendations: z.array(z.string()),
  summary: z.string(),
});

const ClauseExtractionSchema = z.object({
  clauses: z.array(z.object({
    type: z.string(),
    text: z.string(),
    importance: z.enum(["standard", "important", "critical"]),
    notes: z.string(),
  })),
});

const DisputePredictionSchema = z.object({
  predictions: z.array(z.object({
    contractId: z.number(),
    contractTitle: z.string(),
    disputeRiskPercent: z.number().min(0).max(100),
    likelyDisputeAreas: z.array(z.string()),
    earlyWarningSignals: z.array(z.string()),
    preventiveActions: z.array(z.string()),
  })),
  overallDisputeRisk: z.number().min(0).max(100),
  highRiskContracts: z.array(z.string()),
  summary: z.string(),
});

const ComplianceCheckSchema = z.object({
  checks: z.array(z.object({
    area: z.string(),
    status: z.enum(["compliant", "at_risk", "non_compliant", "needs_review"]),
    description: z.string(),
    requiredAction: z.string().optional().nullable(),
    deadline: z.string().optional().nullable(),
  })),
  overallComplianceScore: z.number().min(0).max(100),
  criticalIssues: z.array(z.string()),
  recommendations: z.array(z.string()),
});

// ============================================
// TYPES
// ============================================

export type ContractAnalysis = z.infer<typeof ContractAnalysisSchema>;
export type ClauseExtraction = z.infer<typeof ClauseExtractionSchema>;
export type DisputePrediction = z.infer<typeof DisputePredictionSchema>;
export type ComplianceCheck = z.infer<typeof ComplianceCheckSchema>;

// ============================================
// CONTRACT ANALYSIS
// ============================================

export async function analyzeContract(params: {
  contractId: number;
}): Promise<ContractAnalysis> {
  const contract = await db.getContractById(params.contractId);
  if (!contract) throw new Error("Contract not found");

  const keyDates = await db.getContractKeyDates(params.contractId);
  const documents = await db.getDocuments({ referenceType: "contract", referenceId: params.contractId });

  const prompt = `Analyze this contract for risks, key terms, and missing clauses.

CONTRACT:
- ID: ${contract.id}
- Title: "${contract.title}"
- Type: ${contract.type}
- Status: ${contract.status}
- Party: "${contract.partyName || 'N/A'}"
- Start Date: ${contract.startDate || 'N/A'}
- End Date: ${contract.endDate || 'N/A'}
- Value: $${contract.value || 'N/A'}
- Description: "${contract.description || 'N/A'}"

KEY DATES:
${keyDates.map(kd => `- ${kd.dateType}: ${kd.date} - ${kd.description || ''}`).join("\n") || "No key dates set"}

ASSOCIATED DOCUMENTS: ${documents.length}

Analyze for:
1. Key terms and their favorability
2. Risk factors (financial, legal, operational, reputational)
3. Missing standard clauses (indemnification, limitation of liability, termination, force majeure, confidentiality, dispute resolution, IP rights, data protection)
4. Recommendations for improvement

Respond ONLY with valid JSON:
{
  "contractId": ${params.contractId},
  "riskScore": number (0-100),
  "riskLevel": "low"|"medium"|"high"|"critical",
  "keyTerms": [{ "term": string, "value": string, "favorability": "favorable"|"neutral"|"unfavorable", "notes": string }],
  "risks": [{ "category": string, "severity": "low"|"medium"|"high"|"critical", "description": string, "mitigation": string }],
  "missingClauses": ["string"],
  "recommendations": ["string"],
  "summary": string
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an experienced corporate attorney specializing in contract review and risk analysis. Provide thorough, practical contract assessments. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = ContractAnalysisSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Contract analysis LLM failed:", e);
  }

  // Fallback
  const hasEndDate = !!contract.endDate;
  const hasValue = !!contract.value;
  const daysToExpiry = contract.endDate ? (new Date(contract.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000) : 999;

  return {
    contractId: params.contractId,
    riskScore: daysToExpiry < 30 ? 70 : daysToExpiry < 90 ? 50 : 30,
    riskLevel: daysToExpiry < 30 ? "high" : daysToExpiry < 90 ? "medium" : "low",
    keyTerms: [
      ...(hasValue ? [{ term: "Contract Value", value: `$${contract.value}`, favorability: "neutral" as const, notes: "Review for market alignment" }] : []),
      ...(hasEndDate ? [{ term: "End Date", value: String(contract.endDate), favorability: daysToExpiry < 90 ? "unfavorable" as const : "neutral" as const, notes: daysToExpiry < 90 ? "Approaching expiration" : "Within normal range" }] : []),
    ],
    risks: [
      ...(daysToExpiry < 30 ? [{ category: "Expiration", severity: "high" as const, description: "Contract expiring within 30 days", mitigation: "Initiate renewal discussions immediately" }] : []),
      ...(!hasValue ? [{ category: "Financial", severity: "medium" as const, description: "No contract value specified", mitigation: "Define contract value for financial tracking" }] : []),
    ],
    missingClauses: ["Unable to determine - document text analysis requires AI"],
    recommendations: ["Upload contract document for detailed clause-level analysis"],
    summary: `Contract "${contract.title}" with ${contract.partyName || 'unknown party'}. ${daysToExpiry < 90 ? 'Approaching expiration - action needed.' : 'Status appears normal.'}`,
  };
}

// ============================================
// CLAUSE EXTRACTION
// ============================================

export async function extractClauses(params: {
  contractId: number;
  text?: string;
}): Promise<ClauseExtraction> {
  const contract = await db.getContractById(params.contractId);
  if (!contract) throw new Error("Contract not found");

  const textToAnalyze = params.text || contract.description || "";

  if (!textToAnalyze || textToAnalyze.trim().length < 20) {
    return {
      clauses: [{
        type: "notice",
        text: "Insufficient contract text for clause extraction",
        importance: "standard",
        notes: "Upload the full contract document for clause analysis",
      }],
    };
  }

  const prompt = `Extract and categorize all clauses from this contract text.

CONTRACT: "${contract.title}" (${contract.type})
TEXT:
${textToAnalyze.slice(0, 3000)}

Identify clauses including: payment terms, termination, indemnification, liability limits, confidentiality, IP rights, force majeure, dispute resolution, warranties, representations, governing law, assignment, amendments, notices.

Respond ONLY with valid JSON:
{
  "clauses": [{ "type": string, "text": string (extracted clause text), "importance": "standard"|"important"|"critical", "notes": string }]
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a legal document analysis expert. Extract and categorize contract clauses accurately. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = ClauseExtractionSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Clause extraction LLM failed:", e);
  }

  return { clauses: [] };
}

// ============================================
// DISPUTE PREDICTION
// ============================================

export async function predictDisputes(params?: {
  companyId?: number;
}): Promise<DisputePrediction> {
  const contracts = await db.getContracts({ companyId: params?.companyId });
  const disputes = await db.getDisputes({ companyId: params?.companyId });
  const activeContracts = contracts.filter(c => c.status === "active" || c.status === "pending");

  const prompt = `Analyze these contracts and predict dispute risks.

ACTIVE CONTRACTS (${activeContracts.length}):
${activeContracts.slice(0, 30).map(c => `- ID:${c.id} "${c.title}" Type:${c.type} Party:"${c.partyName || 'N/A'}" Value:$${c.value || 'N/A'} End:${c.endDate || 'N/A'} Status:${c.status}`).join("\n")}

HISTORICAL DISPUTES (${disputes.length}):
${disputes.slice(0, 15).map(d => `- "${d.title}" Status:${d.status} Severity:${d.severity || 'N/A'} Type:${d.type || 'N/A'}`).join("\n")}

Analyze each active contract for dispute risk based on:
1. Contract complexity and value
2. Historical dispute patterns
3. Approaching deadlines or milestones
4. Contract type risk profiles

Respond ONLY with valid JSON:
{
  "predictions": [{ "contractId": number, "contractTitle": string, "disputeRiskPercent": number, "likelyDisputeAreas": ["string"], "earlyWarningSignals": ["string"], "preventiveActions": ["string"] }],
  "overallDisputeRisk": number (0-100),
  "highRiskContracts": ["contract titles"],
  "summary": string
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a legal risk analyst specializing in contract dispute prediction and prevention. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = DisputePredictionSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Dispute prediction LLM failed:", e);
  }

  return {
    predictions: activeContracts.map(c => ({
      contractId: c.id,
      contractTitle: c.title,
      disputeRiskPercent: 15,
      likelyDisputeAreas: ["Standard commercial risks"],
      earlyWarningSignals: ["Monitor for communication delays"],
      preventiveActions: ["Maintain regular stakeholder check-ins"],
    })),
    overallDisputeRisk: disputes.length > 0 ? 40 : 20,
    highRiskContracts: [],
    summary: `Analyzed ${activeContracts.length} active contracts. ${disputes.length} historical disputes found.`,
  };
}

// ============================================
// COMPLIANCE MONITORING
// ============================================

export async function checkCompliance(params?: {
  companyId?: number;
}): Promise<ComplianceCheck> {
  const contracts = await db.getContracts({ companyId: params?.companyId });
  const activeContracts = contracts.filter(c => c.status === "active");
  const documents = await db.getDocuments({ companyId: params?.companyId });

  const prompt = `Assess compliance status across the organization's contract portfolio.

ACTIVE CONTRACTS: ${activeContracts.length}
${activeContracts.slice(0, 20).map(c => `- "${c.title}" Type:${c.type} Party:"${c.partyName || 'N/A'}" End:${c.endDate || 'N/A'}`).join("\n")}

DOCUMENT REPOSITORY: ${documents.length} documents

Check compliance across:
1. Contract renewals and expirations
2. Key date obligations
3. Documentation completeness
4. Regulatory requirements (general business compliance)
5. Data protection obligations

Respond ONLY with valid JSON:
{
  "checks": [{ "area": string, "status": "compliant"|"at_risk"|"non_compliant"|"needs_review", "description": string, "requiredAction": string|null, "deadline": string|null }],
  "overallComplianceScore": number (0-100),
  "criticalIssues": ["string"],
  "recommendations": ["string"]
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a corporate compliance officer. Assess organizational compliance thoroughly and flag actionable issues. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = ComplianceCheckSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Compliance check LLM failed:", e);
  }

  // Fallback: check for expiring contracts
  const expiringSoon = activeContracts.filter(c => {
    if (!c.endDate) return false;
    const days = (new Date(c.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    return days > 0 && days < 60;
  });

  return {
    checks: [
      {
        area: "Contract Renewals",
        status: expiringSoon.length > 0 ? "at_risk" : "compliant",
        description: `${expiringSoon.length} contracts expiring within 60 days`,
        requiredAction: expiringSoon.length > 0 ? "Initiate renewal process" : null,
        deadline: expiringSoon.length > 0 ? expiringSoon[0].endDate?.toString() || null : null,
      },
      {
        area: "Documentation",
        status: "needs_review",
        description: `${documents.length} documents in repository - completeness not verified`,
        requiredAction: "Review document completeness",
        deadline: null,
      },
    ],
    overallComplianceScore: 70,
    criticalIssues: expiringSoon.length > 0 ? [`${expiringSoon.length} contracts expiring soon without renewal initiated`] : [],
    recommendations: ["Implement automated contract renewal tracking", "Regular compliance audit schedule"],
  };
}
