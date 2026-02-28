import { getDb } from "./db";
import { invokeLLM, Message } from "./_core/llm";
import {
  salesCalls,
  conversationInsights,
  dealRiskScores,
  dealNextActions,
  pipelineHealthMetrics,
  dealSlippageEvents,
  accountStakeholders,
  championTracking,
  accountHealthScores,
  battlecards,
  salesContentLibrary,
  guidedSellingChecklists,
  dealChecklistCompletions,
  emailActivityTracking,
  meetingTracking,
  contactEngagementScores,
  meetingPrepBriefs,
  salesAuditLog,
  assignmentRules,
  crmDeals,
  crmContacts,
  crmPipelines,
  users,
  dealStageHistory,
  salesActivities,
  emailSequenceEnrollments,
} from "../drizzle/schema";
import { eq, and, or, desc, asc, sql, gte, lte, isNull, isNotNull, count, avg, sum } from "drizzle-orm";

// ============================================
// REVENUE INTELLIGENCE SERVICE - World Class
// ============================================

export interface RevenueIntelligenceContext {
  userId: number;
  userName?: string;
  companyId?: number;
}

// ============================================
// CALL ANALYSIS & CONVERSATION INTELLIGENCE
// ============================================

export interface CallAnalysisResult {
  callId: number;
  sentiment: string;
  talkRatio: number;
  questionsAsked: number;
  keyTopics: string[];
  actionItems: string[];
  riskSignals: string[];
  buyingSignals: string[];
  competitorsMentioned: string[];
  nextSteps: string[];
  callScore: number;
}

/**
 * Analyze a sales call recording using AI
 */
export async function analyzeCallRecording(
  callId: number,
  transcriptText: string,
  ctx: RevenueIntelligenceContext
): Promise<CallAnalysisResult> {
  const db = getDb();

  // Get call context
  const [call] = await db.select().from(salesCalls).where(eq(salesCalls.id, callId));
  if (!call) throw new Error(`Call ${callId} not found`);

  // Get deal and contact context if available
  let dealContext = "";
  let contactContext = "";

  if (call.dealId) {
    const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, call.dealId));
    if (deal) {
      dealContext = `Deal: ${deal.name}, Stage: ${deal.stage}, Amount: $${deal.amount}`;
    }
  }

  if (call.contactId) {
    const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, call.contactId));
    if (contact) {
      contactContext = `Contact: ${contact.fullName}, Title: ${contact.jobTitle || 'Unknown'}, Company: ${contact.organization || 'Unknown'}`;
    }
  }

  // AI Analysis prompt
  const analysisPrompt: Message[] = [
    {
      role: "user",
      content: `Analyze this sales call transcript and provide detailed insights.

Context:
- Call Type: ${call.callType}
${dealContext ? `- ${dealContext}` : ""}
${contactContext ? `- ${contactContext}` : ""}

Transcript:
${transcriptText}

Provide analysis in the following JSON format:
{
  "sentiment": "very_positive|positive|neutral|negative|very_negative",
  "talkRatio": <number 0-100 representing rep talk percentage>,
  "questionsAsked": <number of questions the rep asked>,
  "longestMonologue": <estimated seconds of longest continuous talk>,
  "keyTopics": ["topic1", "topic2", ...],
  "actionItems": ["action1", "action2", ...],
  "nextSteps": ["step1", "step2", ...],
  "riskSignals": ["signal1", "signal2", ...],
  "buyingSignals": ["signal1", "signal2", ...],
  "objectionsMentioned": ["objection1", "objection2", ...],
  "competitorsMentioned": ["competitor1", "competitor2", ...],
  "pricingDiscussed": true|false,
  "decisionMakerPresent": true|false,
  "followUpRequired": true|false,
  "callScore": <0-100 overall call quality score>,
  "engagementScore": <0-100 prospect engagement level>,
  "summary": "Brief 2-3 sentence summary of the call"
}`,
    },
  ];

  const analysisResponse = await invokeLLM(analysisPrompt);

  let analysis: any;
  try {
    // Extract JSON from response
    const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in response");
    }
  } catch (e) {
    // Default analysis if parsing fails
    analysis = {
      sentiment: "neutral",
      talkRatio: 50,
      questionsAsked: 0,
      longestMonologue: 0,
      keyTopics: [],
      actionItems: [],
      nextSteps: [],
      riskSignals: [],
      buyingSignals: [],
      objectionsMentioned: [],
      competitorsMentioned: [],
      pricingDiscussed: false,
      decisionMakerPresent: false,
      followUpRequired: true,
      callScore: 50,
      engagementScore: 50,
    };
  }

  // Update call record with analysis
  await db
    .update(salesCalls)
    .set({
      aiAnalysisJson: JSON.stringify(analysis),
      sentiment: analysis.sentiment,
      talkRatio: analysis.talkRatio?.toString(),
      longestMonologue: analysis.longestMonologue,
      questionsAsked: analysis.questionsAsked,
      nextStepsIdentified: JSON.stringify(analysis.nextSteps || []),
      objectionsMentioned: JSON.stringify(analysis.objectionsMentioned || []),
      competitorsMentioned: JSON.stringify(analysis.competitorsMentioned || []),
      pricingDiscussed: analysis.pricingDiscussed,
      decisionMakerPresent: analysis.decisionMakerPresent,
      followUpRequired: analysis.followUpRequired,
      keyTopics: JSON.stringify(analysis.keyTopics || []),
      actionItems: JSON.stringify(analysis.actionItems || []),
      riskSignals: JSON.stringify(analysis.riskSignals || []),
      buyingSignals: JSON.stringify(analysis.buyingSignals || []),
      callScore: analysis.callScore,
      engagementScore: analysis.engagementScore,
      transcriptStatus: "completed",
      updatedAt: new Date(),
    })
    .where(eq(salesCalls.id, callId));

  // Extract and save conversation insights
  const insights: any[] = [];

  // Add competitor mentions
  for (const competitor of analysis.competitorsMentioned || []) {
    insights.push({
      callId,
      insightType: "competitor_mention",
      content: competitor,
      confidence: "0.85",
      speaker: "prospect",
    });
  }

  // Add risk signals
  for (const risk of analysis.riskSignals || []) {
    insights.push({
      callId,
      insightType: "risk_signal",
      content: risk,
      confidence: "0.80",
    });
  }

  // Add buying signals
  for (const signal of analysis.buyingSignals || []) {
    insights.push({
      callId,
      insightType: "buying_signal",
      content: signal,
      confidence: "0.80",
    });
  }

  // Add action items
  for (const action of analysis.actionItems || []) {
    insights.push({
      callId,
      insightType: "action_item",
      content: action,
      confidence: "0.90",
    });
  }

  // Bulk insert insights
  if (insights.length > 0) {
    await db.insert(conversationInsights).values(insights);
  }

  return {
    callId,
    sentiment: analysis.sentiment,
    talkRatio: analysis.talkRatio,
    questionsAsked: analysis.questionsAsked,
    keyTopics: analysis.keyTopics || [],
    actionItems: analysis.actionItems || [],
    riskSignals: analysis.riskSignals || [],
    buyingSignals: analysis.buyingSignals || [],
    competitorsMentioned: analysis.competitorsMentioned || [],
    nextSteps: analysis.nextSteps || [],
    callScore: analysis.callScore,
  };
}

// ============================================
// DEAL RISK SCORING ENGINE
// ============================================

export interface RiskScoreResult {
  dealId: number;
  riskScore: number;
  riskLevel: string;
  winProbability: number;
  riskFactors: {
    engagement: number;
    velocity: number;
    stakeholder: number;
    competitive: number;
    budget: number;
    timeline: number;
    champion: number;
    technical: number;
  };
  positiveSignals: string[];
  negativeSignals: string[];
  recommendations: string[];
}

/**
 * Calculate comprehensive deal risk score using AI and data signals
 */
export async function calculateDealRiskScore(
  dealId: number,
  ctx: RevenueIntelligenceContext
): Promise<RiskScoreResult> {
  const db = getDb();

  // Get deal
  const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId));
  if (!deal) throw new Error(`Deal ${dealId} not found`);

  // Get pipeline for stage context
  const [pipeline] = deal.pipelineId
    ? await db.select().from(crmPipelines).where(eq(crmPipelines.id, deal.pipelineId))
    : [null];

  // Get deal stage history
  const stageHistory = await db
    .select()
    .from(dealStageHistory)
    .where(eq(dealStageHistory.dealId, dealId))
    .orderBy(desc(dealStageHistory.createdAt))
    .limit(10);

  // Calculate days in current stage
  const lastStageChange = stageHistory[0];
  const daysInStage = lastStageChange
    ? Math.floor((Date.now() - new Date(lastStageChange.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Get recent activities
  const recentActivities = await db
    .select()
    .from(salesActivities)
    .where(
      and(
        eq(salesActivities.dealId, dealId),
        gte(salesActivities.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      )
    )
    .orderBy(desc(salesActivities.createdAt));

  // Get contact engagement if available
  let contactEngagement = null;
  if (deal.contactId) {
    const [engagement] = await db
      .select()
      .from(contactEngagementScores)
      .where(eq(contactEngagementScores.contactId, deal.contactId));
    contactEngagement = engagement;
  }

  // Get stakeholders
  const stakeholders = await db
    .select()
    .from(accountStakeholders)
    .where(eq(accountStakeholders.dealId, dealId));

  // Get competitors
  const competitors = await db
    .select()
    .from(conversationInsights)
    .where(eq(conversationInsights.insightType, "competitor_mention"));

  // Get recent calls
  const recentCalls = await db
    .select()
    .from(salesCalls)
    .where(
      and(
        eq(salesCalls.dealId, dealId),
        gte(salesCalls.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      )
    );

  // Calculate individual risk factors
  const riskFactors = {
    engagement: calculateEngagementRisk(recentActivities, contactEngagement, recentCalls),
    velocity: calculateVelocityRisk(daysInStage, deal.stage, stageHistory),
    stakeholder: calculateStakeholderRisk(stakeholders),
    competitive: calculateCompetitiveRisk(competitors),
    budget: 30, // Default - needs data
    timeline: calculateTimelineRisk(deal.expectedCloseDate),
    champion: calculateChampionRisk(stakeholders),
    technical: 25, // Default - needs data
  };

  // Calculate overall risk score (weighted average)
  const weights = {
    engagement: 0.20,
    velocity: 0.15,
    stakeholder: 0.15,
    competitive: 0.15,
    budget: 0.10,
    timeline: 0.10,
    champion: 0.10,
    technical: 0.05,
  };

  let overallRisk = 0;
  for (const [factor, weight] of Object.entries(weights)) {
    overallRisk += riskFactors[factor as keyof typeof riskFactors] * weight;
  }

  // Determine risk level
  let riskLevel: string;
  if (overallRisk >= 75) riskLevel = "critical";
  else if (overallRisk >= 50) riskLevel = "high";
  else if (overallRisk >= 25) riskLevel = "medium";
  else riskLevel = "low";

  // Calculate win probability (inverse of risk, adjusted)
  const winProbability = Math.max(10, Math.min(90, 100 - overallRisk + (deal.probability || 0) / 2));

  // Generate signals and recommendations using AI
  const aiInsights = await generateRiskInsights(deal, riskFactors, recentActivities, stakeholders);

  // Save to database
  const previousScore = await db
    .select()
    .from(dealRiskScores)
    .where(eq(dealRiskScores.dealId, dealId))
    .orderBy(desc(dealRiskScores.calculatedAt))
    .limit(1);

  await db.insert(dealRiskScores).values({
    dealId,
    riskScore: Math.round(overallRisk),
    riskLevel: riskLevel as any,
    winProbability: Math.round(winProbability),
    engagementRisk: riskFactors.engagement,
    velocityRisk: riskFactors.velocity,
    stakeholderRisk: riskFactors.stakeholder,
    competitiveRisk: riskFactors.competitive,
    budgetRisk: riskFactors.budget,
    timelineRisk: riskFactors.timeline,
    championRisk: riskFactors.champion,
    technicalRisk: riskFactors.technical,
    positiveSignals: JSON.stringify(aiInsights.positiveSignals),
    negativeSignals: JSON.stringify(aiInsights.negativeSignals),
    riskExplanation: aiInsights.explanation,
    recommendations: JSON.stringify(aiInsights.recommendations),
    previousRiskScore: previousScore[0]?.riskScore,
    scoreChangeReason: previousScore[0] ? `Risk changed from ${previousScore[0].riskScore} to ${Math.round(overallRisk)}` : "Initial calculation",
  });

  // Generate next best actions
  await generateNextBestActions(dealId, aiInsights.recommendations, ctx);

  return {
    dealId,
    riskScore: Math.round(overallRisk),
    riskLevel,
    winProbability: Math.round(winProbability),
    riskFactors,
    positiveSignals: aiInsights.positiveSignals,
    negativeSignals: aiInsights.negativeSignals,
    recommendations: aiInsights.recommendations,
  };
}

function calculateEngagementRisk(activities: any[], engagement: any, calls: any[]): number {
  let risk = 50; // Start at medium

  // No activities in last 30 days = high risk
  if (activities.length === 0) risk += 30;
  else if (activities.length < 3) risk += 15;
  else if (activities.length > 10) risk -= 20;

  // No calls = higher risk
  if (calls.length === 0) risk += 15;
  else if (calls.some(c => c.callScore && c.callScore > 70)) risk -= 15;

  // Contact engagement score
  if (engagement) {
    if (engagement.engagementScore < 30) risk += 20;
    else if (engagement.engagementScore > 70) risk -= 20;
  }

  return Math.max(0, Math.min(100, risk));
}

function calculateVelocityRisk(daysInStage: number, stage: string | null, history: any[]): number {
  // Average days benchmarks by stage (these would be configured per org)
  const stageBenchmarks: Record<string, number> = {
    "Discovery": 14,
    "Qualification": 10,
    "Demo": 14,
    "Proposal": 21,
    "Negotiation": 14,
    "Closed Won": 0,
    "Closed Lost": 0,
  };

  const benchmark = stageBenchmarks[stage || ""] || 14;

  if (daysInStage <= benchmark) return 20;
  if (daysInStage <= benchmark * 1.5) return 40;
  if (daysInStage <= benchmark * 2) return 60;
  if (daysInStage <= benchmark * 3) return 80;
  return 95;
}

function calculateStakeholderRisk(stakeholders: any[]): number {
  if (stakeholders.length === 0) return 80;

  const hasDecisionMaker = stakeholders.some(s => s.role === "decision_maker");
  const hasBudgetHolder = stakeholders.some(s => s.role === "budget_holder");
  const hasChampion = stakeholders.some(s => s.role === "champion");
  const hasBlocker = stakeholders.some(s => s.role === "blocker" || s.sentiment === "blocker");

  let risk = 50;
  if (!hasDecisionMaker) risk += 25;
  if (!hasBudgetHolder) risk += 15;
  if (!hasChampion) risk += 20;
  if (hasBlocker) risk += 20;
  if (stakeholders.length < 3) risk += 10;

  return Math.max(0, Math.min(100, risk));
}

function calculateCompetitiveRisk(competitorInsights: any[]): number {
  const competitorCount = new Set(competitorInsights.map(c => c.content)).size;

  if (competitorCount === 0) return 30;
  if (competitorCount === 1) return 45;
  if (competitorCount === 2) return 60;
  return 75;
}

function calculateTimelineRisk(expectedCloseDate: Date | string | null): number {
  if (!expectedCloseDate) return 50;

  const closeDate = new Date(expectedCloseDate);
  const daysUntilClose = Math.floor((closeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (daysUntilClose < 0) return 90; // Past due
  if (daysUntilClose <= 7) return 30; // Closing soon - low risk
  if (daysUntilClose <= 30) return 25;
  if (daysUntilClose <= 60) return 35;
  if (daysUntilClose <= 90) return 45;
  return 55; // Far out = some risk of slip
}

function calculateChampionRisk(stakeholders: any[]): number {
  const champion = stakeholders.find(s => s.role === "champion");

  if (!champion) return 80;
  if (champion.sentiment === "blocker" || champion.sentiment === "skeptic") return 70;
  if (champion.engagement === "none" || champion.engagement === "low") return 60;
  if (champion.sentiment === "strong_advocate" && champion.engagement === "high") return 15;

  return 40;
}

async function generateRiskInsights(
  deal: any,
  riskFactors: any,
  activities: any[],
  stakeholders: any[]
): Promise<{
  positiveSignals: string[];
  negativeSignals: string[];
  explanation: string;
  recommendations: string[];
}> {
  const prompt: Message[] = [
    {
      role: "user",
      content: `Analyze this deal and provide risk insights:

Deal: ${deal.name}
Amount: $${deal.amount || 0}
Stage: ${deal.stage}
Expected Close: ${deal.expectedCloseDate || "Not set"}

Risk Factors (0-100, higher = more risk):
- Engagement Risk: ${riskFactors.engagement}
- Velocity Risk: ${riskFactors.velocity}
- Stakeholder Risk: ${riskFactors.stakeholder}
- Competitive Risk: ${riskFactors.competitive}
- Timeline Risk: ${riskFactors.timeline}
- Champion Risk: ${riskFactors.champion}

Recent Activities: ${activities.length} in last 30 days
Stakeholders Mapped: ${stakeholders.length}

Provide response in JSON format:
{
  "positiveSignals": ["signal1", "signal2", ...],
  "negativeSignals": ["signal1", "signal2", ...],
  "explanation": "2-3 sentence explanation of the overall risk",
  "recommendations": ["specific action 1", "specific action 2", ...]
}`,
    },
  ];

  try {
    const response = await invokeLLM(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Default fallback
  }

  return {
    positiveSignals: [],
    negativeSignals: riskFactors.engagement > 50 ? ["Low engagement detected"] : [],
    explanation: "Risk assessment based on available data signals.",
    recommendations: ["Schedule follow-up meeting", "Identify decision maker"],
  };
}

async function generateNextBestActions(
  dealId: number,
  recommendations: string[],
  ctx: RevenueIntelligenceContext
): Promise<void> {
  const db = getDb();

  // Map recommendations to action types
  const actionTypeMap: Record<string, string> = {
    "call": "call_contact",
    "email": "send_email",
    "meeting": "schedule_meeting",
    "proposal": "send_proposal",
    "decision": "engage_decision_maker",
    "demo": "schedule_demo",
    "case study": "send_case_study",
    "executive": "involve_executive",
    "objection": "address_objection",
  };

  for (const rec of recommendations.slice(0, 5)) {
    // Determine action type
    let actionType = "call_contact";
    for (const [keyword, type] of Object.entries(actionTypeMap)) {
      if (rec.toLowerCase().includes(keyword)) {
        actionType = type;
        break;
      }
    }

    await db.insert(dealNextActions).values({
      dealId,
      userId: ctx.userId,
      actionType: actionType as any,
      priority: "medium",
      title: rec.slice(0, 255),
      description: rec,
      reasoning: "AI-recommended based on deal risk analysis",
      status: "pending",
    });
  }
}

// ============================================
// PIPELINE HEALTH ANALYTICS
// ============================================

export interface PipelineHealthResult {
  pipelineId: number;
  healthScore: number;
  coverage: number;
  avgVelocity: number;
  stageConversions: Record<string, number>;
  dealsAtRisk: number;
  recommendations: string[];
}

/**
 * Calculate comprehensive pipeline health metrics
 */
export async function calculatePipelineHealth(
  pipelineId: number,
  userId?: number
): Promise<PipelineHealthResult> {
  const db = getDb();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get pipeline
  const [pipeline] = await db.select().from(crmPipelines).where(eq(crmPipelines.id, pipelineId));
  if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);

  // Get deals in pipeline
  const dealsQuery = userId
    ? and(eq(crmDeals.pipelineId, pipelineId), eq(crmDeals.assignedTo, userId))
    : eq(crmDeals.pipelineId, pipelineId);

  const deals = await db.select().from(crmDeals).where(dealsQuery);

  // Calculate pipeline value
  const openDeals = deals.filter(d => d.stage !== "Closed Won" && d.stage !== "Closed Lost");
  const totalPipelineValue = openDeals.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const weightedValue = openDeals.reduce((sum, d) => sum + Number(d.amount || 0) * (d.probability || 0) / 100, 0);

  // Get quota if user specified
  let quotaValue = totalPipelineValue * 0.3; // Default 3x coverage target
  const coverage = quotaValue > 0 ? totalPipelineValue / quotaValue : 0;

  // Calculate average velocity
  const stageHistories = await db
    .select()
    .from(dealStageHistory)
    .where(gte(dealStageHistory.createdAt, thirtyDaysAgo));

  const avgDaysPerStage: Record<string, number[]> = {};
  for (const history of stageHistories) {
    const stage = history.fromStage || "New";
    if (!avgDaysPerStage[stage]) avgDaysPerStage[stage] = [];
    avgDaysPerStage[stage].push(history.daysInPreviousStage || 0);
  }

  const stageAverages: Record<string, number> = {};
  for (const [stage, days] of Object.entries(avgDaysPerStage)) {
    stageAverages[stage] = days.reduce((a, b) => a + b, 0) / days.length;
  }

  // Calculate stage conversion rates
  const stageConversions: Record<string, number> = {};
  // This would need more historical data for accuracy

  // Count deals at risk
  const riskScores = await db
    .select()
    .from(dealRiskScores)
    .where(
      or(
        eq(dealRiskScores.riskLevel, "high"),
        eq(dealRiskScores.riskLevel, "critical")
      )
    );
  const dealsAtRisk = riskScores.length;

  // Calculate overall health score
  const coverageScore = Math.min(100, coverage * 33); // 3x coverage = 100
  const velocityScore = 70; // Would calculate from benchmarks
  const conversionScore = 65; // Would calculate from historical

  const healthScore = Math.round((coverageScore + velocityScore + conversionScore) / 3);

  // Generate recommendations
  const recommendations: string[] = [];
  if (coverage < 3) recommendations.push("Increase pipeline coverage - currently below 3x target");
  if (dealsAtRisk > 5) recommendations.push(`Address ${dealsAtRisk} deals with high risk scores`);
  if (openDeals.length < 10) recommendations.push("Add more deals to pipeline");

  // Save metrics
  await db.insert(pipelineHealthMetrics).values({
    pipelineId,
    userId,
    period: "daily",
    periodStart: thirtyDaysAgo,
    periodEnd: now,
    pipelineCoverage: coverage.toString(),
    weightedPipeline: weightedValue.toString(),
    totalQuota: quotaValue.toString(),
    avgDaysInPipeline: Object.values(stageAverages).reduce((a, b) => a + b, 0).toString(),
    avgDaysPerStage: JSON.stringify(stageAverages),
    velocityTrend: "stable",
    stageConversions: JSON.stringify(stageConversions),
    dealsEntered: openDeals.length,
    overallHealthScore: healthScore,
    coverageScore: Math.round(coverageScore),
    velocityScore,
    conversionScore,
  });

  return {
    pipelineId,
    healthScore,
    coverage,
    avgVelocity: Object.values(stageAverages).reduce((a, b) => a + b, 0),
    stageConversions,
    dealsAtRisk,
    recommendations,
  };
}

// ============================================
// ACCOUNT HEALTH SCORING
// ============================================

/**
 * Calculate account health score
 */
export async function calculateAccountHealth(
  accountId: number
): Promise<any> {
  const db = getDb();

  // Get all deals for account
  const deals = await db.select().from(crmDeals).where(eq(crmDeals.accountId, accountId));

  // Get all contacts for account
  const contacts = await db.select().from(crmContacts).where(eq(crmContacts.accountId, accountId));

  // Get stakeholders
  const stakeholders = await db.select().from(accountStakeholders).where(eq(accountStakeholders.accountId, accountId));

  // Get recent activities
  const recentActivities = await db
    .select()
    .from(salesActivities)
    .where(
      and(
        sql`${salesActivities.contactId} IN (SELECT id FROM crm_contacts WHERE accountId = ${accountId})`,
        gte(salesActivities.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      )
    );

  // Calculate metrics
  const wonDeals = deals.filter(d => d.stage === "Closed Won");
  const openDeals = deals.filter(d => d.stage !== "Closed Won" && d.stage !== "Closed Lost");

  const totalRevenue = wonDeals.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const openPipelineValue = openDeals.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const avgDealSize = wonDeals.length > 0 ? totalRevenue / wonDeals.length : 0;

  // Engagement scoring
  const contactsEngaged = new Set(recentActivities.map(a => a.contactId)).size;
  const engagementScore = Math.min(100, (contactsEngaged / Math.max(contacts.length, 1)) * 100);

  // Relationship score
  const threadsActive = stakeholders.filter(s => s.engagement === "high" || s.engagement === "medium").length;
  const executiveEngagement = stakeholders.some(s => s.role === "executive_sponsor" || s.role === "decision_maker");
  const relationshipScore = Math.min(100, threadsActive * 20 + (executiveEngagement ? 30 : 0));

  // Overall health
  const healthScore = Math.round((engagementScore + relationshipScore) / 2);

  // Determine trend
  let healthTrend: "improving" | "stable" | "declining" = "stable";

  // Save to database
  await db.insert(accountHealthScores).values({
    accountId,
    healthScore,
    healthTrend,
    engagementScore: Math.round(engagementScore),
    relationshipScore: Math.round(relationshipScore),
    totalRevenue: totalRevenue.toString(),
    openOpportunityValue: openPipelineValue.toString(),
    avgDealSize: avgDealSize.toString(),
    contactsEngaged,
    totalContacts: contacts.length,
    threadsActive,
    executiveEngagement,
    lastActivityDate: recentActivities[0]?.createdAt,
  });

  return {
    accountId,
    healthScore,
    healthTrend,
    engagementScore: Math.round(engagementScore),
    relationshipScore: Math.round(relationshipScore),
    totalRevenue,
    openPipelineValue,
    contactsEngaged,
    totalContacts: contacts.length,
  };
}

// ============================================
// MEETING PREP BRIEFS
// ============================================

/**
 * Generate AI meeting prep brief
 */
export async function generateMeetingPrepBrief(
  meetingId: number,
  ctx: RevenueIntelligenceContext
): Promise<any> {
  const db = getDb();

  // Get meeting
  const [meeting] = await db.select().from(meetingTracking).where(eq(meetingTracking.id, meetingId));
  if (!meeting) throw new Error(`Meeting ${meetingId} not found`);

  let dealContext = "";
  let contactContext = "";
  let accountContext = "";

  // Get deal info
  if (meeting.dealId) {
    const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, meeting.dealId));
    if (deal) {
      dealContext = `Deal: ${deal.name}, Stage: ${deal.stage}, Amount: $${deal.amount}, Probability: ${deal.probability}%`;

      // Get deal activities
      const activities = await db
        .select()
        .from(salesActivities)
        .where(eq(salesActivities.dealId, meeting.dealId))
        .orderBy(desc(salesActivities.createdAt))
        .limit(10);

      // Get stakeholders
      const stakeholders = await db
        .select()
        .from(accountStakeholders)
        .where(eq(accountStakeholders.dealId, meeting.dealId));

      // Get risk score
      const [riskScore] = await db
        .select()
        .from(dealRiskScores)
        .where(eq(dealRiskScores.dealId, meeting.dealId))
        .orderBy(desc(dealRiskScores.calculatedAt))
        .limit(1);

      // Get competitors
      const competitors = await db
        .select()
        .from(conversationInsights)
        .where(
          and(
            sql`${conversationInsights.callId} IN (SELECT id FROM sales_calls WHERE dealId = ${meeting.dealId})`,
            eq(conversationInsights.insightType, "competitor_mention")
          )
        );

      // Generate brief using AI
      const prompt: Message[] = [
        {
          role: "user",
          content: `Generate a meeting prep brief for:

Meeting: ${meeting.title}
Type: ${meeting.meetingType}
Date: ${meeting.startTime}

${dealContext}

Recent Activities: ${activities.map(a => `- ${a.activityType}: ${a.subject}`).join("\n")}

Stakeholders: ${stakeholders.map(s => `- ${s.role}: ${s.sentiment}`).join("\n")}

Risk Score: ${riskScore?.riskScore || "Not calculated"} (${riskScore?.riskLevel || "Unknown"})

Competitors Mentioned: ${competitors.map(c => c.content).join(", ") || "None"}

Generate a JSON response:
{
  "executiveSummary": "2-3 sentence overview",
  "talkingPoints": ["point1", "point2", "point3"],
  "questionsToAsk": ["question1", "question2"],
  "objectionsToExpect": ["objection1", "objection2"],
  "dealRisks": ["risk1", "risk2"],
  "opportunities": ["opportunity1", "opportunity2"]
}`,
        },
      ];

      try {
        const response = await invokeLLM(prompt);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const brief = JSON.parse(jsonMatch[0]);

          // Save brief
          await db.insert(meetingPrepBriefs).values({
            meetingId,
            dealId: meeting.dealId,
            userId: ctx.userId,
            executiveSummary: brief.executiveSummary,
            dealHistory: dealContext,
            stakeholderInsights: JSON.stringify(stakeholders),
            recentActivity: JSON.stringify(activities.map(a => ({ type: a.activityType, subject: a.subject }))),
            competitiveIntel: JSON.stringify(competitors.map(c => c.content)),
            talkingPoints: JSON.stringify(brief.talkingPoints),
            questionsToAsk: JSON.stringify(brief.questionsToAsk),
            objectionsToExpect: JSON.stringify(brief.objectionsToExpect),
            dealRisks: JSON.stringify(brief.dealRisks),
            opportunities: JSON.stringify(brief.opportunities),
          });

          return brief;
        }
      } catch (e) {
        // Fallback
      }
    }
  }

  return {
    executiveSummary: "Meeting prep brief generated",
    talkingPoints: ["Review deal status", "Discuss next steps", "Address any concerns"],
    questionsToAsk: ["What are your key priorities?", "What would success look like?"],
    objectionsToExpect: [],
    dealRisks: [],
    opportunities: [],
  };
}

// ============================================
// CONTACT ENGAGEMENT SCORING
// ============================================

/**
 * Calculate and update contact engagement score
 */
export async function updateContactEngagement(
  contactId: number
): Promise<any> {
  const db = getDb();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get email activity
  const emailActivity = await db
    .select({
      opens: sql<number>`SUM(CASE WHEN ${emailActivityTracking.openCount} > 0 THEN 1 ELSE 0 END)`,
      clicks: sql<number>`SUM(CASE WHEN ${emailActivityTracking.clickCount} > 0 THEN 1 ELSE 0 END)`,
      replies: sql<number>`SUM(CASE WHEN ${emailActivityTracking.repliedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
    })
    .from(emailActivityTracking)
    .where(
      and(
        eq(emailActivityTracking.contactId, contactId),
        gte(emailActivityTracking.sentAt, thirtyDaysAgo)
      )
    );

  // Get calls
  const calls = await db
    .select({ count: count() })
    .from(salesCalls)
    .where(
      and(
        eq(salesCalls.contactId, contactId),
        eq(salesCalls.outcome, "connected"),
        gte(salesCalls.callDate, thirtyDaysAgo)
      )
    );

  // Get meetings
  const meetings = await db
    .select({ count: count() })
    .from(meetingTracking)
    .where(
      and(
        eq(meetingTracking.contactId, contactId),
        eq(meetingTracking.status, "completed"),
        gte(meetingTracking.startTime, thirtyDaysAgo)
      )
    );

  // Calculate engagement score
  const emailsOpened = Number(emailActivity[0]?.opens) || 0;
  const emailsClicked = Number(emailActivity[0]?.clicks) || 0;
  const emailsReplied = Number(emailActivity[0]?.replies) || 0;
  const callsConnected = Number(calls[0]?.count) || 0;
  const meetingsHeld = Number(meetings[0]?.count) || 0;

  // Weighted scoring
  const score = Math.min(100,
    emailsOpened * 3 +
    emailsClicked * 8 +
    emailsReplied * 15 +
    callsConnected * 12 +
    meetingsHeld * 20
  );

  // Determine trend
  let trend: "hot" | "warming" | "stable" | "cooling" | "cold";
  if (score >= 80) trend = "hot";
  else if (score >= 60) trend = "warming";
  else if (score >= 40) trend = "stable";
  else if (score >= 20) trend = "cooling";
  else trend = "cold";

  // Upsert engagement score
  await db.insert(contactEngagementScores).values({
    contactId,
    engagementScore: score,
    engagementTrend: trend,
    emailsOpened30d: emailsOpened,
    emailsClicked30d: emailsClicked,
    emailsReplied30d: emailsReplied,
    callsConnected30d: callsConnected,
    meetingsHeld30d: meetingsHeld,
    isEngaged: score >= 40,
  });

  return {
    contactId,
    engagementScore: score,
    trend,
    emailsOpened,
    emailsClicked,
    emailsReplied,
    callsConnected,
    meetingsHeld,
  };
}

// ============================================
// BATTLECARD LOOKUPS
// ============================================

/**
 * Get battlecard for competitor
 */
export async function getBattlecardForCompetitor(
  competitorName: string
): Promise<any> {
  const db = getDb();

  const [battlecard] = await db
    .select()
    .from(battlecards)
    .where(
      and(
        sql`LOWER(${battlecards.competitorName}) LIKE LOWER(${`%${competitorName}%`})`,
        eq(battlecards.isActive, true)
      )
    )
    .limit(1);

  if (battlecard) {
    // Increment view count
    await db
      .update(battlecards)
      .set({
        viewCount: sql`${battlecards.viewCount} + 1`,
        lastViewedAt: new Date(),
      })
      .where(eq(battlecards.id, battlecard.id));
  }

  return battlecard;
}

// ============================================
// ROUND ROBIN ASSIGNMENT
// ============================================

/**
 * Assign entity using round-robin rules
 */
export async function assignViaRoundRobin(
  entityType: "lead" | "deal" | "account",
  entityData: any
): Promise<{ assignedTo: number; ruleName: string } | null> {
  const db = getDb();

  // Get active assignment rules
  const rules = await db
    .select()
    .from(assignmentRules)
    .where(
      and(
        eq(assignmentRules.entityType, entityType),
        eq(assignmentRules.isActive, true)
      )
    )
    .orderBy(desc(assignmentRules.priority));

  for (const rule of rules) {
    // Check if criteria matches
    if (rule.criteria) {
      const criteria = JSON.parse(rule.criteria);
      // Evaluate criteria (simplified)
      let matches = true;
      for (const [field, value] of Object.entries(criteria)) {
        if (entityData[field] !== value) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
    }

    // Get assignees
    const assignees = JSON.parse(rule.assignees || "[]");
    if (assignees.length === 0) continue;

    // Round-robin selection
    const currentIndex = rule.currentIndex || 0;
    const nextIndex = (currentIndex + 1) % assignees.length;
    const assignee = assignees[currentIndex];

    // Update rule state
    await db
      .update(assignmentRules)
      .set({
        currentIndex: nextIndex,
        lastAssignedAt: new Date(),
        lastAssignedTo: assignee.userId,
        totalAssignments: sql`${assignmentRules.totalAssignments} + 1`,
      })
      .where(eq(assignmentRules.id, rule.id));

    return {
      assignedTo: assignee.userId,
      ruleName: rule.name,
    };
  }

  return null;
}

// ============================================
// SLIPPAGE DETECTION
// ============================================

/**
 * Detect and record deal slippage events
 */
export async function detectDealSlippage(
  dealId: number,
  previousDeal: any,
  currentDeal: any
): Promise<void> {
  const db = getDb();

  const events: any[] = [];

  // Check close date pushed
  if (previousDeal.expectedCloseDate && currentDeal.expectedCloseDate) {
    const prevDate = new Date(previousDeal.expectedCloseDate);
    const newDate = new Date(currentDeal.expectedCloseDate);
    if (newDate > prevDate) {
      const daysPushed = Math.floor((newDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      events.push({
        dealId,
        eventType: "close_date_pushed",
        previousValue: previousDeal.expectedCloseDate,
        newValue: currentDeal.expectedCloseDate,
        daysPushed,
        detectedBy: "system",
      });
    }
  }

  // Check amount decreased
  if (previousDeal.amount && currentDeal.amount) {
    const prevAmount = Number(previousDeal.amount);
    const newAmount = Number(currentDeal.amount);
    if (newAmount < prevAmount) {
      events.push({
        dealId,
        eventType: "amount_decreased",
        previousValue: previousDeal.amount.toString(),
        newValue: currentDeal.amount.toString(),
        amountChange: (newAmount - prevAmount).toString(),
        detectedBy: "system",
      });
    }
  }

  // Check probability decreased
  if (previousDeal.probability && currentDeal.probability) {
    if (currentDeal.probability < previousDeal.probability) {
      events.push({
        dealId,
        eventType: "probability_decreased",
        previousValue: previousDeal.probability.toString(),
        newValue: currentDeal.probability.toString(),
        detectedBy: "system",
      });
    }
  }

  // Insert slippage events
  if (events.length > 0) {
    await db.insert(dealSlippageEvents).values(events);
  }
}

// ============================================
// AUDIT LOGGING
// ============================================

/**
 * Log sales audit event
 */
export async function logSalesAudit(
  entityType: string,
  entityId: number,
  action: string,
  changes: any,
  ctx: RevenueIntelligenceContext
): Promise<void> {
  const db = getDb();

  await db.insert(salesAuditLog).values({
    entityType: entityType as any,
    entityId,
    action: action as any,
    changes: JSON.stringify(changes),
    userId: ctx.userId,
    userName: ctx.userName,
  });
}
