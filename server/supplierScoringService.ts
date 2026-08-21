/**
 * Supplier Performance Scoring Service
 * ML-based supplier/vendor performance scoring
 * using delivery, quality, pricing, and communication metrics
 */
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { z } from "zod";
import {
  computeResponsivenessForVendors,
  responsivenessScoreFromMetrics,
  type ResponsivenessMetrics,
} from "./vendorResponsiveness";

// ============================================
// SCHEMAS
// ============================================

const SupplierScoreSchema = z.object({
  scores: z.array(z.object({
    vendorId: z.number(),
    vendorName: z.string(),
    overallScore: z.number().min(0).max(100),
    grade: z.enum(["A", "B", "C", "D", "F"]),
    dimensions: z.object({
      delivery: z.object({ score: z.number(), details: z.string() }),
      quality: z.object({ score: z.number(), details: z.string() }),
      pricing: z.object({ score: z.number(), details: z.string() }),
      responsiveness: z.object({ score: z.number(), details: z.string() }),
      compliance: z.object({ score: z.number(), details: z.string() }),
    }),
    trend: z.enum(["improving", "stable", "declining"]),
    riskLevel: z.enum(["low", "medium", "high"]),
    recommendations: z.array(z.string()),
  })),
  topPerformers: z.array(z.string()),
  needsImprovement: z.array(z.string()),
  summary: z.string(),
});

// ============================================
// TYPES
// ============================================

export type SupplierScoreResult = z.infer<typeof SupplierScoreSchema>;

/** Scoring fans out per vendor, so a single run is bounded. */
const MAX_VENDORS_PER_SCORING_RUN = 30;
/** Weight of the responsiveness dimension in the overall score. */
const RESPONSIVENESS_WEIGHT = 0.15;
/** Neutral placeholder used only when a dimension genuinely has no data behind it. */
const NO_DATA_DIMENSION_SCORE = 50;

function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function gradeFor(overall: number): "A" | "B" | "C" | "D" | "F" {
  if (overall >= 90) return "A";
  if (overall >= 80) return "B";
  if (overall >= 70) return "C";
  if (overall >= 60) return "D";
  return "F";
}

// ============================================
// ML-BASED SUPPLIER SCORING
// ============================================

export async function scoreSuppliers(params?: {
  vendorIds?: number[];
  companyId?: number;
}): Promise<SupplierScoreResult> {
  const allVendors = await db.getVendors(undefined, { companyId: params?.companyId });
  const targetVendors = params?.vendorIds
    ? allVendors.filter(v => params.vendorIds!.includes(v.id))
    : allVendors;

  if (targetVendors.length === 0) {
    return { scores: [], topPerformers: [], needsImprovement: [], summary: "No vendors to score." };
  }

  // Gather performance data for each vendor
  const vendorMetrics: Array<{
    vendor: typeof targetVendors[0];
    poCount: number;
    totalSpend: number;
    avgOrderValue: number;
    onTimeRate: number;
    responsiveness: ResponsivenessMetrics | null;
  }> = [];

  // Scoring is capped at 30 vendors per run; see the note on the returned summary.
  const scoredVendors = targetVendors.slice(0, MAX_VENDORS_PER_SCORING_RUN);

  // Real RFQ responsiveness for the whole batch in one query, so the
  // responsiveness dimension is measured rather than assumed.
  const responsivenessByVendor = await computeResponsivenessForVendors(
    scoredVendors.map(v => v.id),
  );

  const metricsResults = await Promise.all(
    scoredVendors.map(async (vendor) => {
      const [spendingRecords, pos] = await Promise.all([
        db.getVendorSpendingHistory(vendor.id),
        db.getPurchaseOrders({ vendorId: vendor.id }),
      ]);

      const deliveredPOs = pos.filter(po => po.status === "received" || po.status === "partial");
      const terminalPOs = pos.filter(po => po.status === "received" || po.status === "partial" || po.status === "cancelled");
      const onTimeRate = terminalPOs.length > 0 ? deliveredPOs.length / terminalPOs.length : 0;

      const totalSpend = spendingRecords.reduce((s, po) => s + parseFloat(String(po.totalAmount || 0)), 0);
      return {
        vendor,
        poCount: spendingRecords.length,
        totalSpend,
        avgOrderValue: spendingRecords.length > 0 ? totalSpend / spendingRecords.length : 0,
        onTimeRate,
        responsiveness: responsivenessByVendor.get(vendor.id) ?? null,
      };
    })
  );
  vendorMetrics.push(...metricsResults);

  const prompt = `Score these suppliers/vendors on a comprehensive performance framework.

VENDORS (${vendorMetrics.length}):
${vendorMetrics.map(vm => {
    const r = vm.responsiveness;
    const responsiveness = r && r.closed > 0
      ? `RFQsInvited:${r.invited} Answered:${r.responded} Declined:${r.declined} NoReply:${r.noResponse}` +
        ` ResponseRate:${r.responseRatePct?.toFixed(0) ?? 'n/a'}%` +
        ` AvgFirstReply:${r.averageResponseHours !== null ? `${r.averageResponseHours.toFixed(1)}h` : 'n/a'}` +
        ` OnTimeVsDueDate:${r.onTimeRatePct !== null ? `${r.onTimeRatePct.toFixed(0)}%` : 'n/a'}`
      : 'RFQ responsiveness: NO DATA';
    return `- ID:${vm.vendor.id} Name:"${vm.vendor.name}" Contact:"${vm.vendor.contactName || 'N/A'}" POs:${vm.poCount} TotalSpend:$${vm.totalSpend.toFixed(2)} AvgOrder:$${vm.avgOrderValue.toFixed(2)} OnTimeRate:${(vm.onTimeRate * 100).toFixed(0)}% ${responsiveness}`;
  }).join("\n")}

Score each vendor on these dimensions (0-100):
1. DELIVERY: On-time delivery performance, lead time consistency
2. QUALITY: Product quality, defect rates, consistency
3. PRICING: Competitiveness, value for money, price stability
4. RESPONSIVENESS: Use the RFQ response figures given for each vendor. Where they read NO DATA, score 50 and say so in the details rather than inventing a number.
5. COMPLIANCE: Documentation, regulatory compliance, terms adherence

Overall score should be weighted: Delivery 25%, Quality 25%, Pricing 20%, Responsiveness 15%, Compliance 15%

Respond ONLY with valid JSON:
{
  "scores": [{ "vendorId": number, "vendorName": string, "overallScore": number, "grade": "A"|"B"|"C"|"D"|"F", "dimensions": { "delivery": { "score": number, "details": string }, "quality": { "score": number, "details": string }, "pricing": { "score": number, "details": string }, "responsiveness": { "score": number, "details": string }, "compliance": { "score": number, "details": string } }, "trend": "improving"|"stable"|"declining", "riskLevel": "low"|"medium"|"high", "recommendations": ["string"] }],
  "topPerformers": ["vendor names"],
  "needsImprovement": ["vendor names"],
  "summary": string
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a supply chain performance analyst. Score suppliers objectively using available data. Be realistic - give lower scores when data is limited. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = SupplierScoreSchema.safeParse(parsed);
      if (validated.success) {
        // Responsiveness is measured, not judged: overwrite whatever the model
        // returned for that dimension with the computed value, and re-weight
        // the overall score so the two stay consistent.
        for (const score of validated.data.scores) {
          const metrics = responsivenessByVendor.get(score.vendorId);
          if (!metrics) continue;
          const measured = responsivenessScoreFromMetrics(metrics);
          const previous = score.dimensions.responsiveness.score;
          score.dimensions.responsiveness = {
            score: measured.score ?? NO_DATA_DIMENSION_SCORE,
            details: measured.score === null
              ? `No RFQ response data. ${measured.details}`
              : `${measured.details}${measured.lowConfidence ? " (low confidence: small sample)" : ""}`,
          };
          score.overallScore = clampScore(
            score.overallScore +
              (score.dimensions.responsiveness.score - previous) * RESPONSIVENESS_WEIGHT,
          );
          score.grade = gradeFor(score.overallScore);
        }
        return validated.data;
      }
    }
  } catch (e) {
    console.warn("Supplier scoring LLM failed:", e);
  }

  // Fallback: rule-based scoring
  const scores: SupplierScoreResult["scores"] = vendorMetrics.map(vm => {
    const deliveryScore = vm.onTimeRate * 100;
    const pricingScore = vm.poCount > 10 ? 75 : vm.poCount > 3 ? 65 : 50;
    const qualityScore = vm.poCount > 5 ? 70 : 55;
    const measuredResponsiveness = vm.responsiveness
      ? responsivenessScoreFromMetrics(vm.responsiveness)
      : { score: null, lowConfidence: true, details: "No RFQ invitations on record." };
    const responsivenessScore = measuredResponsiveness.score ?? NO_DATA_DIMENSION_SCORE;
    const complianceScore = 65;

    const overall = Math.round(
      deliveryScore * 0.25 +
      qualityScore * 0.25 +
      pricingScore * 0.20 +
      responsivenessScore * RESPONSIVENESS_WEIGHT +
      complianceScore * 0.15
    );

    const grade = gradeFor(overall);

    return {
      vendorId: vm.vendor.id,
      vendorName: vm.vendor.name,
      overallScore: overall,
      grade,
      dimensions: {
        delivery: { score: Math.round(deliveryScore), details: `${vm.poCount} orders tracked` },
        quality: { score: qualityScore, details: "Estimated from order history" },
        pricing: { score: pricingScore, details: `Avg order: $${vm.avgOrderValue.toFixed(2)}` },
        responsiveness: {
          score: responsivenessScore,
          details: measuredResponsiveness.score === null
            ? `No RFQ response data. ${measuredResponsiveness.details}`
            : `${measuredResponsiveness.details}${measuredResponsiveness.lowConfidence ? " (low confidence: small sample)" : ""}`,
        },
        compliance: { score: complianceScore, details: "Default - requires audit data" },
      },
      trend: "stable" as const,
      riskLevel: overall < 60 ? "high" as const : overall < 75 ? "medium" as const : "low" as const,
      recommendations: overall < 70 ? ["Review vendor performance and consider alternatives"] : ["Maintain current relationship"],
    };
  });

  const sorted = [...scores].sort((a, b) => b.overallScore - a.overallScore);

  return {
    scores,
    topPerformers: sorted.slice(0, 3).map(s => s.vendorName),
    needsImprovement: sorted.filter(s => s.overallScore < 70).map(s => s.vendorName),
    summary:
      `Scored ${scores.length} suppliers. Average score: ${scores.length > 0 ? Math.round(scores.reduce((s, sc) => s + sc.overallScore, 0) / scores.length) : 0}/100.` +
      // Never let a capped run read as full coverage.
      (targetVendors.length > scores.length
        ? ` ${targetVendors.length - scores.length} further vendor(s) were not scored in this run (cap: ${MAX_VENDORS_PER_SCORING_RUN}).`
        : ""),
  };
}
