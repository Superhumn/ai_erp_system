/**
 * Vendor Negotiation Service
 * AI-powered automated vendor negotiations
 * Analyzes spending patterns, market data, and vendor relationships
 * to generate negotiation strategies and draft communications
 */
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { nanoid } from "nanoid";

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

/**
 * Analyze vendor relationship and generate negotiation strategy
 */
export async function analyzeNegotiationOpportunity(params: {
  vendorId: number;
  productIds?: number[];
  negotiationType: string;
}): Promise<NegotiationAnalysis> {
  // Gather vendor data
  const spending = await db.getVendorSpendingHistory(params.vendorId);

  // Get product details if provided
  let productDetails: any[] = [];
  if (params.productIds?.length) {
    const productPromises = params.productIds.map((pid) =>
      db.getProductById(pid)
    );
    const products = await Promise.all(productPromises);
    productDetails = products.filter((product) => product);
  }

  // Get recent POs for price trend analysis
  const recentPOs = await db.getPurchaseOrders({ vendorId: params.vendorId });
  const last10POs = recentPOs.slice(0, 10);

  // Use AI to analyze and generate strategy
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
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "NegotiationAnalysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              leveragePoints: {
                type: "array",
                items: { type: "string" },
                default: [],
              },
              marketBenchmark: {
                type: ["object", "null"],
                nullable: true,
                properties: {
                  low: { type: "number" },
                  average: { type: "number" },
                  high: { type: "number" },
                },
                required: ["low", "average", "high"],
                additionalProperties: false,
              },
              vendorDependency: {
                type: "string",
                enum: ["low", "medium", "high"],
              },
              recommendedStrategy: {
                type: "string",
              },
              targetPriceReduction: {
                type: "number",
              },
              confidenceScore: {
                type: "number",
              },
              risks: {
                type: "array",
                items: { type: "string" },
                default: [],
              },
              alternativeVendors: {
                type: "array",
                items: { type: "string" },
                default: [],
              },
            },
            required: [
              "leveragePoints",
              "marketBenchmark",
              "vendorDependency",
              "recommendedStrategy",
              "targetPriceReduction",
              "confidenceScore",
              "risks",
              "alternativeVendors",
            ],
          },
        },
      },
    });

    const rawContent: unknown = aiResult.choices[0]?.message?.content;

    let parsed: any;
    if (typeof rawContent === "string") {
      parsed = JSON.parse(rawContent);
    } else {
      parsed = rawContent;
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("LLM response was not an object");
    }

    const leveragePoints: string[] = Array.isArray(parsed.leveragePoints)
      ? parsed.leveragePoints.map((p: any) => String(p))
      : [];

    const risks: string[] = Array.isArray(parsed.risks)
      ? parsed.risks.map((r: any) => String(r))
      : [];

    const alternativeVendors: string[] = Array.isArray(parsed.alternativeVendors)
      ? parsed.alternativeVendors.map((v: any) => String(v))
      : [];

    const vendorDependencyRaw = String(parsed.vendorDependency || "medium").toLowerCase();
    const vendorDependency: "low" | "medium" | "high" =
      vendorDependencyRaw === "low" || vendorDependencyRaw === "high"
        ? (vendorDependencyRaw as "low" | "medium" | "high")
        : "medium";

    const recommendedStrategy =
      typeof parsed.recommendedStrategy === "string"
        ? parsed.recommendedStrategy
        : "";

    const clampNumber = (value: any, min: number, max: number, fallback: number) => {
      const num = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(num)) return fallback;
      return Math.min(Math.max(num, min), max);
    };

    const targetPriceReduction = clampNumber(
      parsed.targetPriceReduction,
      0,
      50,
      0
    );

    const confidenceScore = clampNumber(
      parsed.confidenceScore,
      0,
      100,
      0
    );

    let marketBenchmark: { low: number; average: number; high: number } | null = null;
    if (parsed.marketBenchmark && typeof parsed.marketBenchmark === "object") {
      const mb = parsed.marketBenchmark as any;
      const maxBenchmark = 1_000_000;
      const low = clampNumber(mb.low, 0, maxBenchmark, 0);
      const average = clampNumber(mb.average, 0, maxBenchmark, 0);
      const high = clampNumber(mb.high, 0, maxBenchmark, 0);
      marketBenchmark = { low, average, high };
    }

    const result: NegotiationAnalysis = {
      leveragePoints,
      marketBenchmark,
      vendorDependency,
      recommendedStrategy,
      targetPriceReduction,
      confidenceScore,
      risks,
      alternativeVendors,
    };

    return result;
  } catch (e) {
    // Fall back to rule-based analysis
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

/**
 * Generate AI-drafted negotiation email
 */
export async function generateNegotiationDraft(params: {
  negotiationId: number;
  roundNumber: number;
  messageType: "initial_offer" | "counter_offer" | "final_offer" | "acceptance" | "rejection";
}): Promise<NegotiationDraft> {
  const negotiation = await db.getVendorNegotiationById(params.negotiationId);
  if (!negotiation) throw new Error("Negotiation not found");

  const rounds = await db.getNegotiationRounds(params.negotiationId);
  const previousRounds = rounds.filter((r) => r.roundNumber < params.roundNumber);

  // Get vendor info
  const vendor = await db.getVendorById(negotiation.vendorId);

  const draftPrompt = `Draft a professional vendor negotiation email.

Context:
- Vendor: ${vendor?.name || "Vendor"}
- Negotiation Type: ${negotiation.type}
- Current Unit Price: $${negotiation.currentUnitPrice || "N/A"}
- Target Unit Price: $${negotiation.targetUnitPrice || "N/A"}
- Current Payment Terms: ${negotiation.currentPaymentTerms != null ? `${negotiation.currentPaymentTerms} days` : "N/A"}
- Target Payment Terms: ${negotiation.targetPaymentTerms != null ? `${negotiation.targetPaymentTerms} days` : "N/A"}
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

    const content = aiResult.choices[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Validate and coerce the parsed JSON
      return {
        subject: typeof parsed.subject === "string" ? parsed.subject : "Vendor Negotiation",
        body: typeof parsed.body === "string" ? parsed.body : "",
        tone: typeof parsed.tone === "string" ? parsed.tone : "professional",
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.filter((p: any) => typeof p === "string") : [],
      };
    }
  } catch (e) {
    // Fall through to default
  }

  // Fallback drafts
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

/**
 * Create a new negotiation session
 */
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

  // Create the negotiation record
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

  // Auto-analyze if requested
  if (params.autoAnalyze) {
    try {
      const analysis = await analyzeNegotiationOpportunity({
        vendorId: params.vendorId,
        productIds: params.productIds,
        negotiationType: params.type,
      });

      // Calculate targets from analysis
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
      // Keep as draft if analysis fails and record error details for troubleshooting
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

/**
 * Record a negotiation round (outbound or inbound)
 */
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

  const existingRounds = await db.getNegotiationRounds(params.negotiationId);
  const roundNumber = existingRounds.length + 1;

  let aiDraft: string | undefined;
  let aiReasoning: string | undefined;

  // Generate AI draft for outbound messages
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

  // Update negotiation status
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

  // If accepted, record agreed terms
  if (params.messageType === "acceptance") {
    updateData.completedAt = new Date();
    updateData.agreedUnitPrice = params.proposedUnitPrice?.toFixed(4) || negotiation.targetUnitPrice;
    updateData.agreedPaymentTerms = params.proposedPaymentTerms || negotiation.targetPaymentTerms;
    updateData.agreedLeadTimeDays = params.proposedLeadTimeDays || negotiation.targetLeadTimeDays;
  }

  await db.updateVendorNegotiation(params.negotiationId, updateData);

  return { id: roundResult.id, roundNumber };
}
