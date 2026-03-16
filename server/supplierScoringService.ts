/**
 * Supplier Performance Scoring Service
 * ML-based supplier/vendor performance scoring
 * using delivery, quality, pricing, and communication metrics
 */
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { z } from "zod";

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

// ============================================
// ML-BASED SUPPLIER SCORING
// ============================================

export async function scoreSuppliers(params?: {
  vendorIds?: number[];
  companyId?: number;
}): Promise<SupplierScoreResult> {
  const allVendors = await db.getVendors({ companyId: params?.companyId });
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
  }> = [];

  for (const vendor of targetVendors.slice(0, 30)) {
    const spending = await db.getVendorSpendingHistory(vendor.id);
    const pos = await db.getPurchaseOrders({ vendorId: vendor.id });

    const deliveredPOs = pos.filter(po => po.status === "delivered" || po.status === "received");
    // Simple on-time estimation based on available data
    const onTimeRate = deliveredPOs.length > 0 ? 0.85 : 0; // Default 85% if they have deliveries

    vendorMetrics.push({
      vendor,
      poCount: spending?.orderCount || 0,
      totalSpend: spending?.totalSpend || 0,
      avgOrderValue: spending?.avgOrderValue || 0,
      onTimeRate,
    });
  }

  const prompt = `Score these suppliers/vendors on a comprehensive performance framework.

VENDORS (${vendorMetrics.length}):
${vendorMetrics.map(vm => `- ID:${vm.vendor.id} Name:"${vm.vendor.name}" Contact:"${vm.vendor.contactName || 'N/A'}" POs:${vm.poCount} TotalSpend:$${vm.totalSpend.toFixed(2)} AvgOrder:$${vm.avgOrderValue.toFixed(2)} OnTimeRate:${(vm.onTimeRate * 100).toFixed(0)}%`).join("\n")}

Score each vendor on these dimensions (0-100):
1. DELIVERY: On-time delivery performance, lead time consistency
2. QUALITY: Product quality, defect rates, consistency
3. PRICING: Competitiveness, value for money, price stability
4. RESPONSIVENESS: Communication speed, issue resolution, flexibility
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
      if (validated.success) return validated.data;
    }
  } catch (e) {
    console.warn("Supplier scoring LLM failed:", e);
  }

  // Fallback: rule-based scoring
  const scores: SupplierScoreResult["scores"] = vendorMetrics.map(vm => {
    const deliveryScore = vm.onTimeRate * 100;
    const pricingScore = vm.poCount > 10 ? 75 : vm.poCount > 3 ? 65 : 50;
    const qualityScore = vm.poCount > 5 ? 70 : 55;
    const responsivenessScore = 60;
    const complianceScore = 65;

    const overall = Math.round(
      deliveryScore * 0.25 +
      qualityScore * 0.25 +
      pricingScore * 0.20 +
      responsivenessScore * 0.15 +
      complianceScore * 0.15
    );

    const grade = overall >= 90 ? "A" as const : overall >= 80 ? "B" as const : overall >= 70 ? "C" as const : overall >= 60 ? "D" as const : "F" as const;

    return {
      vendorId: vm.vendor.id,
      vendorName: vm.vendor.name,
      overallScore: overall,
      grade,
      dimensions: {
        delivery: { score: Math.round(deliveryScore), details: `${vm.poCount} orders tracked` },
        quality: { score: qualityScore, details: "Estimated from order history" },
        pricing: { score: pricingScore, details: `Avg order: $${vm.avgOrderValue.toFixed(2)}` },
        responsiveness: { score: responsivenessScore, details: "Default - requires more data" },
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
    summary: `Scored ${scores.length} suppliers. Average score: ${scores.length > 0 ? Math.round(scores.reduce((s, sc) => s + sc.overallScore, 0) / scores.length) : 0}/100.`,
  };
}
