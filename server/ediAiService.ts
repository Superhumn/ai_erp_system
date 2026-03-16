/**
 * EDI AI Service
 * AI-powered EDI anomaly detection, error prediction,
 * and transaction pattern analysis
 */
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { z } from "zod";

// ============================================
// SCHEMAS
// ============================================

const EdiAnomalyResultSchema = z.object({
  anomalies: z.array(z.object({
    transactionId: z.number().optional().nullable(),
    type: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]),
    description: z.string(),
    affectedPartner: z.string().optional().nullable(),
    recommendation: z.string(),
  })),
  patterns: z.array(z.object({
    pattern: z.string(),
    frequency: z.string(),
    significance: z.enum(["informational", "noteworthy", "actionable"]),
  })),
  healthScore: z.number().min(0).max(100),
  summary: z.string(),
});

const EdiErrorPredictionSchema = z.object({
  predictions: z.array(z.object({
    partnerName: z.string(),
    errorType: z.string(),
    probability: z.number().min(0).max(100),
    basedOn: z.string(),
    preventiveAction: z.string(),
  })),
  overallErrorRisk: z.number().min(0).max(100),
  recommendations: z.array(z.string()),
});

// ============================================
// TYPES
// ============================================

export type EdiAnomalyResult = z.infer<typeof EdiAnomalyResultSchema>;
export type EdiErrorPrediction = z.infer<typeof EdiErrorPredictionSchema>;

// ============================================
// EDI ANOMALY DETECTION
// ============================================

export async function detectEdiAnomalies(): Promise<EdiAnomalyResult> {
  // Get EDI transaction history
  const ediPartners = await db.getEdiPartners();
  const ediTransactions = await db.getEdiTransactions();

  const prompt = `Analyze these EDI transactions for anomalies and unusual patterns.

EDI PARTNERS (${ediPartners.length}):
${ediPartners.slice(0, 20).map(p => `- ID:${p.id} Name:"${p.name}" Type:${p.partnerType || 'N/A'}`).join("\n") || "No partners configured"}

EDI TRANSACTIONS (${ediTransactions.length}):
${ediTransactions.slice(0, 40).map(t => `- ID:${t.id} Type:${t.transactionSetCode} Direction:${t.direction} Partner:${t.tradingPartnerId} Status:${t.status} Date:${t.createdAt}`).join("\n") || "No transactions"}

Look for:
1. Unusual transaction volumes (spikes or drops)
2. Failed transaction patterns
3. Timing anomalies
4. Partner communication issues
5. Data quality problems

Respond ONLY with valid JSON:
{
  "anomalies": [{ "transactionId": number|null, "type": string, "severity": "low"|"medium"|"high"|"critical", "description": string, "affectedPartner": string|null, "recommendation": string }],
  "patterns": [{ "pattern": string, "frequency": string, "significance": "informational"|"noteworthy"|"actionable" }],
  "healthScore": number (0-100),
  "summary": string
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an EDI systems analyst specializing in B2B transaction monitoring and anomaly detection. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = EdiAnomalyResultSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("EDI anomaly detection LLM failed:", e);
  }

  // Fallback
  const failedTransactions = ediTransactions.filter(t => t.status === "failed" || t.status === "error");
  return {
    anomalies: failedTransactions.slice(0, 10).map(t => ({
      transactionId: t.id,
      type: "failed_transaction",
      severity: "medium" as const,
      description: `EDI transaction ${t.id} failed (${t.transactionType})`,
      affectedPartner: String(t.tradingPartnerId),
      recommendation: "Investigate and retry transaction",
    })),
    patterns: [],
    healthScore: failedTransactions.length === 0 ? 95 : Math.max(50, 95 - failedTransactions.length * 5),
    summary: `Analyzed ${ediTransactions.length} EDI transactions. ${failedTransactions.length} failures detected.`,
  };
}

// ============================================
// EDI ERROR PREDICTION
// ============================================

export async function predictEdiErrors(): Promise<EdiErrorPrediction> {
  const ediPartners = await db.getEdiPartners();
  const ediTransactions = await db.getEdiTransactions();

  // Group errors by partner
  const errorsByPartner: Record<string, number> = {};
  const totalByPartner: Record<string, number> = {};
  for (const t of ediTransactions) {
    const pId = String(t.tradingPartnerId);
    totalByPartner[pId] = (totalByPartner[pId] || 0) + 1;
    if (t.status === "failed" || t.status === "error") {
      errorsByPartner[pId] = (errorsByPartner[pId] || 0) + 1;
    }
  }

  const prompt = `Predict likely EDI errors based on historical patterns.

EDI PARTNERS:
${ediPartners.slice(0, 20).map(p => {
    const errors = errorsByPartner[String(p.id)] || 0;
    const total = totalByPartner[String(p.id)] || 0;
    return `- "${p.name}" (ID:${p.id}): ${total} transactions, ${errors} errors (${total > 0 ? ((errors / total) * 100).toFixed(1) : 0}% error rate)`;
  }).join("\n") || "No partners"}

RECENT ERROR TRANSACTIONS:
${ediTransactions.filter(t => t.status === "failed" || t.status === "error").slice(0, 15).map(t => `- TX#${t.id}: Type:${t.transactionType} Partner:${t.tradingPartnerId} Error:${t.errorMessage || 'N/A'}`).join("\n") || "No errors"}

Predict which partners/transaction types are likely to experience errors next.

Respond ONLY with valid JSON:
{
  "predictions": [{ "partnerName": string, "errorType": string, "probability": number (0-100), "basedOn": string, "preventiveAction": string }],
  "overallErrorRisk": number (0-100),
  "recommendations": ["string"]
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an EDI integration specialist. Predict and prevent B2B transaction errors. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = EdiErrorPredictionSchema.safeParse(parsed);
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("EDI error prediction LLM failed:", e);
  }

  return {
    predictions: ediPartners.filter(p => (errorsByPartner[String(p.id)] || 0) > 0).map(p => ({
      partnerName: p.name,
      errorType: "recurring_failure",
      probability: Math.min(((errorsByPartner[String(p.id)] || 0) / (totalByPartner[String(p.id)] || 1)) * 100, 100),
      basedOn: "Historical error rate",
      preventiveAction: "Review partner configuration and test connectivity",
    })),
    overallErrorRisk: Object.values(errorsByPartner).reduce((s, e) => s + e, 0) > 0 ? 40 : 10,
    recommendations: ["Monitor error rates and set up automated alerts", "Test partner connections regularly"],
  };
}
