/**
 * Vendor Negotiation Service
 * AI-powered automated vendor negotiations
 * Analyzes spending patterns, market data, and vendor relationships
 * to generate negotiation strategies and draft communications
 */
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { nanoid } from "nanoid";
import { z } from "zod";

// Helper function to detect duplicate key errors
function isDuplicateKeyError(error: any): boolean {
  return error?.code === 'ER_DUP_ENTRY' || 
         error?.errno === 1062 || 
         error?.message?.includes('Duplicate entry');
}

// Zod schemas for validating LLM responses
const NegotiationAnalysisSchema = z.object({
  leveragePoints: z.array(z.string()),
  marketBenchmark: z.object({
    low: z.number(),
    average: z.number(),
    high: z.number(),
  }).nullable(),
  vendorDependency: z.enum(["low", "medium", "high"]),
  recommendedStrategy: z.string(),
  targetPriceReduction: z.number().min(0).max(100),
  confidenceScore: z.number().min(0).max(100),
  risks: z.array(z.string()),
  alternativeVendors: z.array(z.string()),
});

const NegotiationDraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  tone: z.string(),
  keyPoints: z.array(z.string()),
});

interface NegotiationAnalysis {
  leveragePoints: string[];
  marketBenchmark: { low: number; average: number; high: number } | null;
  vendorDependency: "low" | "medium" | "high";
  recommendedStrategy: string;
  targetPriceReduction: number;
  confidenceScore: number;
  risks: string[];
  alternativeVendors: string[];
}

interface NegotiationDraft {
  subject: string;
  body: string;
  tone: string;
  keyPoints: string[];
}

export async function analyzeNegotiationOpportunity(params: {
  vendorId: number;
  productIds?: number[];
  negotiationType: string;
}): Promise<NegotiationAnalysis> {
  const spending = await db.getVendorSpendingHistory(params.vendorId);

  let productDetails: any[] = [];
  if (params.productIds?.length) {
    for (const pid of params.productIds) {
      const product = await db.getProductById(pid);
      if (product) productDetails.push(product);
    }
  }

  const recentPOs = await db.getPurchaseOrders({ vendorId: params.vendorId });
  const last10POs = recentPOs.slice(0, 10);

  const analysisPrompt = `Analyze this vendor relationship and generate a negotiation strategy.

Vendor Spending History:
- Total Spend: $${spending?.totalSpend?.toFixed(2) || "0"}
- Order Count: ${spending?.orderCount || 0}
- Average Order Value: $${spending?.avgOrderValue?.toFixed(2) || "0"}

Products: ${productDetails.map((p) => `${p.name} (SKU: ${p.sku}, Current Cost: $${p.costPrice})`).join(", ") || "N/A"}

Recent PO History (last 10):
${last10POs.map((po) => `- PO#${po.poNumber}: $${po.totalAmount} on ${po.orderDate}`).join("\n") || "No recent POs"}

Negotiation Type: ${params.negotiationType}

Respond ONLY with valid JSON matching this schema:
{
  "leveragePoints": ["string array of leverage points"],
  "marketBenchmark": { "low": number, "average": number, "high": number },
  "vendorDependency": "low" | "medium" | "high",
  "recommendedStrategy": "string describing the strategy",
  "targetPriceReduction": number (percentage, e.g. 10 for 10%),
  "confidenceScore": number (0-100),
  "risks": ["string array of risks"],
  "alternativeVendors": ["suggestions for alternative vendors to create competitive tension"]
}`;

  try {
    const aiResult = await invokeLLM({
      messages: [
        { role: "system", content: "You are a procurement and negotiation expert. Analyze vendor data and provide strategic negotiation recommendations. Always respond with valid JSON only." },
        { role: "user", content: analysisPrompt },
      ],
    });

    const text = typeof aiResult.content === "string" ? aiResult.content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = NegotiationAnalysisSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
      console.warn(`LLM analysis response failed validation for vendorId ${params.vendorId}:`, validated.error.format());
    }
  } catch (e) {
    console.warn(`LLM analysis failed for vendorId ${params.vendorId}:`, e);
  }

  // Fallback: rule-based analysis
  const totalSpend = spending?.totalSpend || 0;
  const orderCount = spending?.orderCount || 0;
  const leveragePoints: string[] = [];
  let vendorDependency: "low" | "medium" | "high" = "medium";
  let targetReduction = 5;

  if (totalSpend > 100000) {
    leveragePoints.push("High-volume buyer - significant revenue source for vendor");
    targetReduction = 10;
  }
  if (totalSpend > 50000) {
    leveragePoints.push("Consistent purchasing relationship");
  }
  if (orderCount > 20) {
    leveragePoints.push("Frequent, reliable ordering pattern");
    targetReduction = Math.min(targetReduction + 2, 15);
  }
  if (productDetails.length > 3) {
    leveragePoints.push("Multi-product relationship creates bundling opportunities");
    vendorDependency = "high";
  }

  return {
    leveragePoints: leveragePoints.length > 0 ? leveragePoints : ["Standard business relationship"],
    marketBenchmark: null,
    vendorDependency,
    recommendedStrategy: totalSpend > 50000
      ? "Leverage volume commitment for price reduction with multi-year contract offer"
      : "Request competitive pricing review with market benchmarking",
    targetPriceReduction: targetReduction,
    confidenceScore: Math.min(40 + orderCount * 2 + (totalSpend > 50000 ? 20 : 0), 85),
    risks: ["Vendor may reduce service quality", "May need to qualify alternative vendors"],
    alternativeVendors: [],
  };
}

export async function generateNegotiationDraft(params: {
  negotiationId: number;
  roundNumber: number;
  messageType: "initial_offer" | "counter_offer" | "final_offer" | "acceptance" | "rejection";
}): Promise<NegotiationDraft> {
  const negotiation = await db.getVendorNegotiationById(params.negotiationId);
  if (!negotiation) throw new Error("Negotiation not found");

  const rounds = await db.getNegotiationRounds(params.negotiationId);
  const previousRounds = rounds.filter((r) => r.roundNumber < params.roundNumber);

  const vendor = await db.getVendorById(negotiation.vendorId);

  const draftPrompt = `Draft a professional vendor negotiation email.

Context:
- Vendor: ${vendor?.name || "Vendor"}
- Negotiation Type: ${negotiation.type}
- Current Unit Price: $${negotiation.currentUnitPrice || "N/A"}
- Target Unit Price: $${negotiation.targetUnitPrice || "N/A"}
- Current Payment Terms: ${negotiation.currentPaymentTerms || "N/A"} days
- Target Payment Terms: ${negotiation.targetPaymentTerms || "N/A"} days
- Message Type: ${params.messageType}
- Round: ${params.roundNumber}

${previousRounds.length > 0 ? `Previous Rounds:\n${previousRounds.map((r) => `Round ${r.roundNumber} (${r.direction}): ${r.messageType} - Proposed price: $${r.proposedUnitPrice || "N/A"}`).join("\n")}` : "This is the initial outreach."}

AI Strategy Notes: ${negotiation.aiStrategy || "Standard negotiation approach"}

Respond ONLY with valid JSON:
{
  "subject": "email subject line",
  "body": "full email body text",
  "tone": "professional/firm/collaborative",
  "keyPoints": ["array of key negotiation points made"]
}`;

  try {
    const aiResult = await invokeLLM({
      messages: [
        { role: "system", content: "You are a skilled procurement negotiator. Draft professional, persuasive vendor negotiation emails. Always respond with valid JSON only." },
        { role: "user", content: draftPrompt },
      ],
    });

    const text = typeof aiResult.content === "string" ? aiResult.content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validated = NegotiationDraftSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
      console.warn(`LLM draft response failed validation for negotiationId ${params.negotiationId}:`, validated.error.format());
    }
  } catch (e) {
    console.warn(`LLM draft generation failed for negotiationId ${params.negotiationId}:`, e);
  }

  const vendorName = vendor?.name || "Valued Supplier";
  const contactName = vendor?.contactName || "Team";

  if (params.messageType === "initial_offer") {
    return {
      subject: `Pricing Review Request - ${negotiation.title}`,
      body: `Dear ${contactName},\n\nWe value our continued partnership with ${vendorName} and would like to discuss our pricing arrangement for the upcoming period.\n\nGiven our consistent order volume and commitment to this relationship, we believe there is an opportunity to review our current pricing structure to better reflect market conditions and our mutual growth.\n\nWe would like to propose a meeting to discuss ${negotiation.type === "price_reduction" ? "a pricing adjustment" : "updated terms"} that benefits both parties.\n\nPlease let us know your availability to discuss.\n\nBest regards`,
      tone: "collaborative",
      keyPoints: ["Volume commitment", "Long-term partnership", "Market alignment"],
    };
  }

  return {
    subject: `Re: ${negotiation.title} - Updated Proposal`,
    body: `Dear ${contactName},\n\nThank you for your response regarding our pricing discussion. After careful review, we would like to continue our dialogue to find terms that work for both organizations.\n\nBest regards`,
    tone: "professional",
    keyPoints: ["Continued negotiation", "Mutual benefit"],
  };
}

export async function initiateNegotiation(params: {
  companyId?: number;
  vendorId: number;
  title: string;
  type: "price_reduction" | "volume_discount" | "payment_terms" | "lead_time" | "contract_renewal" | "new_contract";
  productIds?: number[];
  rawMaterialIds?: number[];
  currentUnitPrice?: number;
  currentPaymentTerms?: number;
  currentLeadTimeDays?: number;
  currentMinOrderAmount?: number;
  currentAnnualVolume?: number;
  initiatedBy?: number;
  autoAnalyze?: boolean;
}) {
  const negotiationNumber = `NEG-${nanoid(8).toUpperCase()}`;

  const result = await db.createVendorNegotiation({
    companyId: params.companyId,
    vendorId: params.vendorId,
    negotiationNumber,
    title: params.title,
    type: params.type,
    status: "draft",
    priority: "medium",
    productIds: params.productIds ? JSON.stringify(params.productIds) : undefined,
    rawMaterialIds: params.rawMaterialIds ? JSON.stringify(params.rawMaterialIds) : undefined,
    currentUnitPrice: params.currentUnitPrice?.toFixed(4),
    currentPaymentTerms: params.currentPaymentTerms,
    currentLeadTimeDays: params.currentLeadTimeDays,
    currentMinOrderAmount: params.currentMinOrderAmount?.toFixed(2),
    currentAnnualVolume: params.currentAnnualVolume?.toFixed(2),
    initiatedBy: params.initiatedBy,
  });

  if (params.autoAnalyze) {
    try {
      const analysis = await analyzeNegotiationOpportunity({
        vendorId: params.vendorId,
        productIds: params.productIds,
        negotiationType: params.type,
      });

      const targetUnitPrice = params.currentUnitPrice
        ? params.currentUnitPrice * (1 - analysis.targetPriceReduction / 100)
        : undefined;

      const estimatedSavings = params.currentUnitPrice && params.currentAnnualVolume
        ? (params.currentUnitPrice - (targetUnitPrice || 0)) * params.currentAnnualVolume
        : undefined;

      await db.updateVendorNegotiation(result.id, {
        status: "ready",
        aiAnalysis: JSON.stringify(analysis),
        aiStrategy: analysis.recommendedStrategy,
        aiConfidenceScore: analysis.confidenceScore.toFixed(2),
        targetUnitPrice: targetUnitPrice?.toFixed(4),
        estimatedSavings: estimatedSavings?.toFixed(2),
        estimatedSavingsPercent: analysis.targetPriceReduction.toFixed(4),
      });
    } catch (e) {
      await db.updateVendorNegotiation(result.id, {
        status: "draft",
        aiAnalysis: JSON.stringify({
          error: e instanceof Error ? e.message : String(e),
        }),
      });
    }
  }

  return { id: result.id, negotiationNumber };
}

export async function addNegotiationRound(params: {
  negotiationId: number;
  direction: "outbound" | "inbound";
  messageType: "initial_offer" | "counter_offer" | "acceptance" | "rejection" | "info_request" | "final_offer";
  proposedUnitPrice?: number;
  proposedPaymentTerms?: number;
  proposedLeadTimeDays?: number;
  proposedMinOrderAmount?: number;
  proposedVolume?: number;
  messageContent?: string;
  sentBy?: number;
  generateAiDraft?: boolean;
}) {
  const negotiation = await db.getVendorNegotiationById(params.negotiationId);
  if (!negotiation) throw new Error("Negotiation not found");

  // Retry logic to handle race conditions with unique constraint
  let retries = 3;
  let lastError: any;
  
  while (retries > 0) {
    try {
      // Use atomic round number generation to avoid race conditions
      const roundNumber = await db.getNextRoundNumber(params.negotiationId);

      let aiDraft: string | undefined;
      let aiReasoning: string | undefined;

      if (
        params.generateAiDraft &&
        params.direction === "outbound" &&
        params.messageType !== "info_request"
      ) {
        const draft = await generateNegotiationDraft({
          negotiationId: params.negotiationId,
          roundNumber,
          messageType: params.messageType,
        });
        aiDraft = JSON.stringify(draft);
        aiReasoning = `Strategy: ${draft.tone}. Key points: ${draft.keyPoints.join(", ")}`;
      }

      const roundResult = await db.createNegotiationRound({
        negotiationId: params.negotiationId,
        roundNumber,
        direction: params.direction,
        messageType: params.messageType,
        proposedUnitPrice: params.proposedUnitPrice?.toFixed(4),
        proposedPaymentTerms: params.proposedPaymentTerms,
        proposedLeadTimeDays: params.proposedLeadTimeDays,
        proposedMinOrderAmount: params.proposedMinOrderAmount?.toFixed(2),
        proposedVolume: params.proposedVolume?.toFixed(2),
        messageContent: params.messageContent,
        aiGeneratedDraft: aiDraft,
        aiReasoning,
        sentAt: params.direction === "outbound" ? new Date() : undefined,
        receivedAt: params.direction === "inbound" ? new Date() : undefined,
        sentBy: params.sentBy,
      });

      let newStatus: string = negotiation.status;
      if (params.messageType === "initial_offer" && params.direction === "outbound") {
        newStatus = "in_progress";
      } else if (params.messageType === "counter_offer" && params.direction === "inbound") {
        newStatus = "counter_offered";
      } else if (params.messageType === "acceptance") {
        newStatus = "accepted";
      } else if (params.messageType === "rejection") {
        newStatus = "rejected";
      }

      const updateData: any = {
        status: newStatus,
        negotiationRounds: roundNumber,
      };

      if (params.direction === "outbound") {
        updateData.lastEmailSentAt = new Date();
      } else {
        updateData.lastResponseAt = new Date();
      }

      if (params.messageType === "acceptance") {
        updateData.completedAt = new Date();
        updateData.agreedUnitPrice = params.proposedUnitPrice?.toFixed(4) || negotiation.targetUnitPrice;
        updateData.agreedPaymentTerms = params.proposedPaymentTerms || negotiation.targetPaymentTerms;
        updateData.agreedLeadTimeDays = params.proposedLeadTimeDays || negotiation.targetLeadTimeDays;
      }

      await db.updateVendorNegotiation(params.negotiationId, updateData);

      return { id: roundResult.id, roundNumber };
    } catch (error: any) {
      lastError = error;
      if (isDuplicateKeyError(error)) {
        retries--;
        if (retries > 0) {
          const delay = Math.pow(2, 2 - retries) * 100 + Math.random() * 50;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        break;
      }
      throw error;
    }
  }
  
  throw new Error(`Failed to create negotiation round after retries: ${lastError?.message || lastError}`);
}
