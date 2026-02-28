import { getDb } from "./db";
import { sendEmail, formatEmailHtml } from "./_core/email";
import { invokeLLM, Message } from "./_core/llm";
import * as revenueIntelligence from "./revenueIntelligenceService";
import {
  crmContacts,
  crmDeals,
  crmPipelines,
  crmInteractions,
  crmTags,
  crmContactTags,
  crmEmailCampaigns,
  crmCampaignRecipients,
  salesTerritories,
  salesQuotas,
  commissionPlans,
  commissionAssignments,
  commissionTransactions,
  leadScoringRules,
  leadScoreHistory,
  salesAutomationRules,
  salesAutomationExecutions,
  emailSequences,
  emailSequenceSteps,
  emailSequenceEnrollments,
  emailSequenceEvents,
  salesActivities,
  dealStageHistory,
  salesForecasts,
  salesGoals,
  salesPlaybooks,
  dealPlaybookAssignments,
  salesCoachingNotes,
  salesLeaderboardSnapshots,
  dealCompetitors,
  salesMetricsDaily,
  users,
  emailTemplates,
  sentEmails,
  meetingTracking,
  meetingPrepBriefs,
  contactEngagementScores,
} from "../drizzle/schema";
import { eq, and, or, desc, asc, sql, gte, lte, isNull, isNotNull, like, inArray } from "drizzle-orm";

// ============================================
// SALES AUTOMATION SERVICE - Million Dollar Sales System
// ============================================

export interface SalesAutomationContext {
  userId: number;
  userName?: string;
  companyId?: number;
}

// ============================================
// LEAD SCORING ENGINE
// ============================================

export interface LeadScoreResult {
  contactId: number;
  previousScore: number;
  newScore: number;
  rulesApplied: Array<{ ruleId: number; ruleName: string; scoreChange: number }>;
}

/**
 * Calculate and update lead score for a contact based on all active scoring rules
 */
export async function calculateLeadScore(
  contactId: number,
  ctx?: SalesAutomationContext
): Promise<LeadScoreResult> {
  const db = getDb();

  // Get the contact
  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId));
  if (!contact) {
    throw new Error(`Contact ${contactId} not found`);
  }

  const previousScore = contact.leadScore || 0;
  let newScore = 0;
  const rulesApplied: Array<{ ruleId: number; ruleName: string; scoreChange: number }> = [];

  // Get all active scoring rules ordered by priority
  const rules = await db
    .select()
    .from(leadScoringRules)
    .where(eq(leadScoringRules.isActive, true))
    .orderBy(desc(leadScoringRules.priority));

  // Get contact's tags
  const contactTags = await db
    .select({ tagId: crmContactTags.tagId, tagName: crmTags.name })
    .from(crmContactTags)
    .leftJoin(crmTags, eq(crmContactTags.tagId, crmTags.id))
    .where(eq(crmContactTags.contactId, contactId));
  const tagNames = contactTags.map((t) => t.tagName).filter(Boolean);

  // Get contact's interactions count
  const [interactionStats] = await db
    .select({
      totalInteractions: sql<number>`COUNT(*)`,
      emailsOpened: sql<number>`SUM(CASE WHEN ${crmInteractions.opened} = true THEN 1 ELSE 0 END)`,
      emailsClicked: sql<number>`SUM(CASE WHEN ${crmInteractions.clicked} = true THEN 1 ELSE 0 END)`,
      emailsReplied: sql<number>`SUM(CASE WHEN ${crmInteractions.replied} = true THEN 1 ELSE 0 END)`,
    })
    .from(crmInteractions)
    .where(eq(crmInteractions.contactId, contactId));

  // Evaluate each rule
  for (const rule of rules) {
    const criteria = JSON.parse(rule.criteria || "{}");
    let ruleMatches = false;
    let scoreChange = rule.scoreValue;

    // Evaluate criteria based on category
    switch (rule.category) {
      case "demographic":
        ruleMatches = evaluateDemographicCriteria(contact, criteria);
        break;
      case "firmographic":
        ruleMatches = evaluateFirmographicCriteria(contact, criteria);
        break;
      case "behavioral":
        ruleMatches = evaluateBehavioralCriteria(contact, interactionStats, criteria);
        break;
      case "engagement":
        ruleMatches = evaluateEngagementCriteria(contact, interactionStats, criteria);
        break;
      case "fit":
        ruleMatches = evaluateFitCriteria(contact, tagNames, criteria);
        break;
      case "custom":
        ruleMatches = evaluateCustomCriteria(contact, tagNames, interactionStats, criteria);
        break;
    }

    if (ruleMatches) {
      // Apply score based on type
      switch (rule.scoreType) {
        case "add":
          newScore += scoreChange;
          break;
        case "subtract":
          newScore -= scoreChange;
          break;
        case "multiply":
          newScore *= scoreChange;
          break;
        case "set":
          newScore = scoreChange;
          break;
      }

      rulesApplied.push({
        ruleId: rule.id,
        ruleName: rule.name,
        scoreChange: rule.scoreType === "add" ? scoreChange : rule.scoreType === "subtract" ? -scoreChange : scoreChange,
      });
    }
  }

  // === REVENUE INTELLIGENCE INTEGRATION ===
  // Boost score based on contact engagement (async lookup)
  try {
    const [engagementScore] = await db
      .select()
      .from(contactEngagementScores)
      .where(eq(contactEngagementScores.contactId, contactId))
      .orderBy(desc(contactEngagementScores.calculatedAt))
      .limit(1);
    if (engagementScore?.engagementScore) {
      // Add up to 20 points based on engagement (0-100 score / 5)
      const engagementBoost = Math.floor(engagementScore.engagementScore / 5);
      newScore += engagementBoost;
      if (engagementBoost > 0) {
        rulesApplied.push({
          ruleId: 0,
          ruleName: "Engagement Score Boost",
          scoreChange: engagementBoost,
        });
      }
    }
  } catch (e) {
    // Engagement score not available, skip
  }

  // Ensure score doesn't go below 0
  newScore = Math.max(0, newScore);

  // Update contact's lead score
  await db
    .update(crmContacts)
    .set({ leadScore: newScore, updatedAt: new Date() })
    .where(eq(crmContacts.id, contactId));

  // Log score history
  if (previousScore !== newScore) {
    await db.insert(leadScoreHistory).values({
      contactId,
      previousScore,
      newScore,
      scoreChange: newScore - previousScore,
      changeReason: "rule_applied",
      notes: JSON.stringify(rulesApplied),
      createdBy: ctx?.userId,
    });
  }

  return { contactId, previousScore, newScore, rulesApplied };
}

function evaluateDemographicCriteria(contact: any, criteria: any): boolean {
  // Examples: job title, department, seniority
  if (criteria.jobTitle && contact.jobTitle) {
    const titleLower = contact.jobTitle.toLowerCase();
    if (criteria.jobTitleContains && !titleLower.includes(criteria.jobTitleContains.toLowerCase())) return false;
    if (criteria.jobTitleEquals && titleLower !== criteria.jobTitleEquals.toLowerCase()) return false;
  }
  if (criteria.department && contact.department !== criteria.department) return false;
  if (criteria.country && contact.country !== criteria.country) return false;
  return true;
}

function evaluateFirmographicCriteria(contact: any, criteria: any): boolean {
  // Examples: company size, industry, revenue
  if (criteria.organization && contact.organization) {
    const orgLower = contact.organization.toLowerCase();
    if (criteria.organizationContains && !orgLower.includes(criteria.organizationContains.toLowerCase())) return false;
  }
  return true;
}

function evaluateBehavioralCriteria(contact: any, interactionStats: any, criteria: any): boolean {
  // Examples: email opens, website visits, document downloads
  if (criteria.minEmailsOpened && (interactionStats?.emailsOpened || 0) < criteria.minEmailsOpened) return false;
  if (criteria.minEmailsClicked && (interactionStats?.emailsClicked || 0) < criteria.minEmailsClicked) return false;
  if (criteria.minTotalInteractions && (interactionStats?.totalInteractions || 0) < criteria.minTotalInteractions) return false;
  return true;
}

function evaluateEngagementCriteria(contact: any, interactionStats: any, criteria: any): boolean {
  // Examples: recent activity, response rate
  if (criteria.hasReplied && !interactionStats?.emailsReplied) return false;
  if (criteria.recentActivity) {
    const daysSinceContact = contact.lastContactedAt
      ? Math.floor((Date.now() - new Date(contact.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24))
      : Infinity;
    if (daysSinceContact > criteria.recentActivityDays) return false;
  }
  return true;
}

function evaluateFitCriteria(contact: any, tagNames: string[], criteria: any): boolean {
  // Examples: ICP match, buyer persona
  if (criteria.hasTags && Array.isArray(criteria.hasTags)) {
    const hasAllTags = criteria.hasTags.every((tag: string) =>
      tagNames.some((t) => t?.toLowerCase() === tag.toLowerCase())
    );
    if (!hasAllTags) return false;
  }
  if (criteria.contactType && contact.contactType !== criteria.contactType) return false;
  return true;
}

function evaluateCustomCriteria(contact: any, tagNames: string[], interactionStats: any, criteria: any): boolean {
  // Flexible custom criteria evaluation
  if (criteria.field && criteria.operator && criteria.value !== undefined) {
    const fieldValue = contact[criteria.field];
    switch (criteria.operator) {
      case "equals": return fieldValue === criteria.value;
      case "not_equals": return fieldValue !== criteria.value;
      case "contains": return String(fieldValue || "").toLowerCase().includes(String(criteria.value).toLowerCase());
      case "greater_than": return Number(fieldValue) > Number(criteria.value);
      case "less_than": return Number(fieldValue) < Number(criteria.value);
      case "is_set": return fieldValue !== null && fieldValue !== undefined && fieldValue !== "";
      case "is_not_set": return fieldValue === null || fieldValue === undefined || fieldValue === "";
    }
  }
  return true;
}

// ============================================
// DEAL STAGE AUTOMATION
// ============================================

export interface StageChangeResult {
  dealId: number;
  fromStage: string | null;
  toStage: string;
  automationsTriggered: number;
  actions: Array<{ type: string; status: string; details: any }>;
}

/**
 * Process deal stage change and trigger automations
 */
export async function processDealStageChange(
  dealId: number,
  newStage: string,
  ctx: SalesAutomationContext
): Promise<StageChangeResult> {
  const db = getDb();

  // Get the deal
  const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId));
  if (!deal) {
    throw new Error(`Deal ${dealId} not found`);
  }

  const fromStage = deal.stage;
  const actions: Array<{ type: string; status: string; details: any }> = [];

  // Record stage history
  const [lastStageEntry] = await db
    .select()
    .from(dealStageHistory)
    .where(eq(dealStageHistory.dealId, dealId))
    .orderBy(desc(dealStageHistory.createdAt))
    .limit(1);

  const daysInPreviousStage = lastStageEntry
    ? Math.floor((Date.now() - new Date(lastStageEntry.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  await db.insert(dealStageHistory).values({
    dealId,
    fromStage,
    toStage: newStage,
    daysInPreviousStage,
    changedBy: ctx.userId,
    previousProbability: deal.probability,
    previousAmount: deal.amount,
  });

  // Update deal stage
  await db
    .update(crmDeals)
    .set({ stage: newStage, updatedAt: new Date() })
    .where(eq(crmDeals.id, dealId));

  // Find and trigger relevant automation rules
  const automationRules = await db
    .select()
    .from(salesAutomationRules)
    .where(
      and(
        eq(salesAutomationRules.isActive, true),
        eq(salesAutomationRules.triggerType, "deal_stage_changed")
      )
    )
    .orderBy(desc(salesAutomationRules.priority));

  let automationsTriggered = 0;

  for (const rule of automationRules) {
    const conditions = JSON.parse(rule.triggerConditions || "{}");

    // Check if conditions match
    let shouldTrigger = true;
    if (conditions.fromStage && conditions.fromStage !== fromStage) shouldTrigger = false;
    if (conditions.toStage && conditions.toStage !== newStage) shouldTrigger = false;
    if (conditions.minAmount && Number(deal.amount) < conditions.minAmount) shouldTrigger = false;

    // Check pipeline filter
    if (rule.applyToPipelines) {
      const pipelines = JSON.parse(rule.applyToPipelines);
      if (!pipelines.includes(deal.pipelineId)) shouldTrigger = false;
    }

    if (shouldTrigger) {
      // Create automation execution
      await db.insert(salesAutomationExecutions).values({
        ruleId: rule.id,
        dealId,
        contactId: deal.contactId,
        triggerEvent: "deal_stage_changed",
        triggerData: JSON.stringify({ fromStage, toStage: newStage, dealAmount: deal.amount }),
        status: rule.delayMinutes ? "pending" : "running",
        scheduledFor: rule.delayMinutes ? new Date(Date.now() + rule.delayMinutes * 60000) : null,
      });

      // Execute actions if no delay
      if (!rule.delayMinutes) {
        const actionResults = await executeAutomationActions(rule, deal, ctx);
        actions.push(...actionResults);
      }

      automationsTriggered++;

      // Update rule stats
      await db
        .update(salesAutomationRules)
        .set({
          totalExecutions: sql`${salesAutomationRules.totalExecutions} + 1`,
          lastExecutedAt: new Date(),
        })
        .where(eq(salesAutomationRules.id, rule.id));
    }
  }

  // Log activity
  await db.insert(salesActivities).values({
    dealId,
    contactId: deal.contactId,
    activityType: "stage_changed",
    subject: `Deal moved from ${fromStage || "new"} to ${newStage}`,
    performedBy: ctx.userId,
  });

  // === REVENUE INTELLIGENCE INTEGRATION ===
  // Recalculate deal risk score on stage change
  try {
    await revenueIntelligence.calculateDealRiskScore(dealId, ctx);
  } catch (e) {
    console.warn(`[RevIntel] Risk score calculation failed for deal ${dealId}:`, e);
  }

  // Detect slippage if stage regressed
  const stageOrder = ["new", "contacted", "qualified", "proposal", "negotiation"];
  const fromIndex = stageOrder.indexOf(fromStage || "new");
  const toIndex = stageOrder.indexOf(newStage);
  if (toIndex < fromIndex && toIndex >= 0 && fromIndex >= 0) {
    try {
      await revenueIntelligence.detectDealSlippage(dealId, { stage: fromStage }, { stage: newStage });
    } catch (e) {
      console.warn(`[RevIntel] Slippage detection failed for deal ${dealId}:`, e);
    }
  }

  // Update contact engagement score
  if (deal.contactId) {
    try {
      await revenueIntelligence.updateContactEngagement(deal.contactId);
    } catch (e) {
      console.warn(`[RevIntel] Engagement update failed for contact ${deal.contactId}:`, e);
    }
  }

  return { dealId, fromStage, toStage: newStage, automationsTriggered, actions };
}

/**
 * Execute automation rule actions
 */
async function executeAutomationActions(
  rule: any,
  deal: any,
  ctx: SalesAutomationContext
): Promise<Array<{ type: string; status: string; details: any }>> {
  const db = getDb();
  const results: Array<{ type: string; status: string; details: any }> = [];
  const actions = JSON.parse(rule.actions || "[]");

  // Get contact for personalization
  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, deal.contactId));

  for (const action of actions) {
    try {
      switch (action.type) {
        case "send_email":
          if (contact?.email) {
            let emailBody = action.body || "";
            let emailSubject = action.subject || "";

            // If template ID provided, get template
            if (action.templateId) {
              const [template] = await db
                .select()
                .from(emailTemplates)
                .where(eq(emailTemplates.id, action.templateId));
              if (template) {
                emailBody = template.bodyHtml || template.bodyText || "";
                emailSubject = template.subject || emailSubject;
              }
            }

            // Personalize content
            emailBody = personalizeContent(emailBody, contact, deal);
            emailSubject = personalizeContent(emailSubject, contact, deal);

            await sendEmail({
              to: contact.email,
              subject: emailSubject,
              html: formatEmailHtml(emailBody),
            });

            results.push({ type: "send_email", status: "completed", details: { to: contact.email, subject: emailSubject } });
          }
          break;

        case "create_task":
          // Create a task for the deal owner or specified user
          const assignTo = action.assignTo === "owner" ? deal.assignedTo : action.assignUserId;
          await db.insert(salesActivities).values({
            dealId: deal.id,
            contactId: deal.contactId,
            activityType: "task_created",
            subject: personalizeContent(action.taskTitle || "Follow up task", contact, deal),
            description: personalizeContent(action.taskDescription || "", contact, deal),
            performedBy: ctx.userId,
          });
          results.push({ type: "create_task", status: "completed", details: { taskTitle: action.taskTitle, assignTo } });
          break;

        case "update_deal":
          const updates: any = {};
          if (action.setProbability !== undefined) updates.probability = action.setProbability;
          if (action.addTag) {
            // Add tag to contact
            const [tag] = await db.select().from(crmTags).where(eq(crmTags.name, action.addTag));
            if (tag) {
              await db.insert(crmContactTags).values({ contactId: deal.contactId, tagId: tag.id }).onDuplicateKeyUpdate({ set: { tagId: tag.id } });
            }
          }
          if (Object.keys(updates).length > 0) {
            await db.update(crmDeals).set(updates).where(eq(crmDeals.id, deal.id));
          }
          results.push({ type: "update_deal", status: "completed", details: updates });
          break;

        case "notify_user":
          // Send internal notification
          results.push({ type: "notify_user", status: "completed", details: { userId: action.userId, message: action.message } });
          break;

        case "webhook":
          // Fire webhook
          if (action.url) {
            const payload = {
              event: "automation_triggered",
              rule: rule.name,
              deal,
              contact,
              timestamp: new Date().toISOString(),
            };
            await fetch(action.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            results.push({ type: "webhook", status: "completed", details: { url: action.url } });
          }
          break;

        case "enroll_sequence":
          // Enroll contact in email sequence
          if (action.sequenceId && contact) {
            await enrollInSequence(contact.id, action.sequenceId, ctx);
            results.push({ type: "enroll_sequence", status: "completed", details: { sequenceId: action.sequenceId } });
          }
          break;
      }
    } catch (error: any) {
      results.push({ type: action.type, status: "failed", details: { error: error.message } });
    }
  }

  return results;
}

/**
 * Personalize content with contact and deal data
 */
function personalizeContent(content: string, contact: any, deal?: any): string {
  if (!content) return content;

  const replacements: Record<string, string> = {
    "{{firstName}}": contact?.firstName || "",
    "{{lastName}}": contact?.lastName || "",
    "{{fullName}}": contact?.fullName || "",
    "{{email}}": contact?.email || "",
    "{{organization}}": contact?.organization || "",
    "{{jobTitle}}": contact?.jobTitle || "",
    "{{dealName}}": deal?.name || "",
    "{{dealAmount}}": deal?.amount ? `$${Number(deal.amount).toLocaleString()}` : "",
    "{{dealStage}}": deal?.stage || "",
  };

  let result = content;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(key, "g"), value);
  }

  return result;
}

// ============================================
// EMAIL SEQUENCE ENGINE
// ============================================

/**
 * Enroll a contact in an email sequence
 */
export async function enrollInSequence(
  contactId: number,
  sequenceId: number,
  ctx: SalesAutomationContext
): Promise<{ enrollmentId: number; nextStepScheduledAt: Date | null }> {
  const db = getDb();

  // Check if already enrolled
  const [existingEnrollment] = await db
    .select()
    .from(emailSequenceEnrollments)
    .where(
      and(
        eq(emailSequenceEnrollments.contactId, contactId),
        eq(emailSequenceEnrollments.sequenceId, sequenceId),
        eq(emailSequenceEnrollments.status, "active")
      )
    );

  if (existingEnrollment) {
    return { enrollmentId: existingEnrollment.id, nextStepScheduledAt: existingEnrollment.nextStepScheduledAt };
  }

  // Get sequence and first step
  const [sequence] = await db.select().from(emailSequences).where(eq(emailSequences.id, sequenceId));
  if (!sequence || !sequence.isActive) {
    throw new Error(`Sequence ${sequenceId} not found or inactive`);
  }

  const [firstStep] = await db
    .select()
    .from(emailSequenceSteps)
    .where(and(eq(emailSequenceSteps.sequenceId, sequenceId), eq(emailSequenceSteps.isActive, true)))
    .orderBy(asc(emailSequenceSteps.stepNumber))
    .limit(1);

  // Calculate when first step should be sent
  const nextStepScheduledAt = firstStep
    ? calculateNextStepTime(firstStep, sequence)
    : null;

  // Create enrollment
  const [result] = await db.insert(emailSequenceEnrollments).values({
    sequenceId,
    contactId,
    currentStepId: firstStep?.id,
    currentStepNumber: 1,
    status: "active",
    nextStepScheduledAt,
    enrolledBy: ctx.userId,
  });

  const enrollmentId = result.insertId;

  // Log enrollment event
  await db.insert(emailSequenceEvents).values({
    enrollmentId,
    eventType: "enrolled",
    eventData: JSON.stringify({ sequenceId, contactId, enrolledBy: ctx.userId }),
  });

  // Update sequence stats
  await db
    .update(emailSequences)
    .set({ totalEnrolled: sql`${emailSequences.totalEnrolled} + 1` })
    .where(eq(emailSequences.id, sequenceId));

  return { enrollmentId, nextStepScheduledAt };
}

/**
 * Calculate when the next step should be executed
 */
function calculateNextStepTime(step: any, sequence: any): Date {
  const delayMs =
    (step.delayDays || 0) * 24 * 60 * 60 * 1000 +
    (step.delayHours || 0) * 60 * 60 * 1000 +
    (step.delayMinutes || 0) * 60 * 1000;

  let scheduledTime = new Date(Date.now() + delayMs);

  // Adjust for sending window if specified
  if (sequence.sendingWindow) {
    const window = JSON.parse(sequence.sendingWindow);
    // This would need timezone-aware logic in production
    const hour = scheduledTime.getHours();
    const startHour = parseInt(window.start?.split(":")[0] || "9");
    const endHour = parseInt(window.end?.split(":")[0] || "17");

    if (hour < startHour) {
      scheduledTime.setHours(startHour, 0, 0, 0);
    } else if (hour >= endHour) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
      scheduledTime.setHours(startHour, 0, 0, 0);
    }
  }

  // Skip weekends if configured
  if (!sequence.sendOnWeekends) {
    const day = scheduledTime.getDay();
    if (day === 0) scheduledTime.setDate(scheduledTime.getDate() + 1); // Sunday -> Monday
    if (day === 6) scheduledTime.setDate(scheduledTime.getDate() + 2); // Saturday -> Monday
  }

  return scheduledTime;
}

/**
 * Process pending sequence steps (called by scheduler)
 */
export async function processSequenceSteps(): Promise<{ processed: number; errors: number }> {
  const db = getDb();
  let processed = 0;
  let errors = 0;

  // Get enrollments with steps due
  const dueEnrollments = await db
    .select()
    .from(emailSequenceEnrollments)
    .where(
      and(
        eq(emailSequenceEnrollments.status, "active"),
        lte(emailSequenceEnrollments.nextStepScheduledAt, new Date())
      )
    )
    .limit(100);

  for (const enrollment of dueEnrollments) {
    try {
      await executeSequenceStep(enrollment);
      processed++;
    } catch (error: any) {
      errors++;
      console.error(`Error processing sequence step for enrollment ${enrollment.id}:`, error);

      // Log error event
      await db.insert(emailSequenceEvents).values({
        enrollmentId: enrollment.id,
        stepId: enrollment.currentStepId,
        eventType: "error",
        errorMessage: error.message,
      });
    }
  }

  return { processed, errors };
}

/**
 * Execute a sequence step for an enrollment
 */
async function executeSequenceStep(enrollment: any): Promise<void> {
  const db = getDb();

  // Get current step
  const [step] = await db
    .select()
    .from(emailSequenceSteps)
    .where(eq(emailSequenceSteps.id, enrollment.currentStepId));

  if (!step) {
    await completeSequence(enrollment.id, "no_more_steps");
    return;
  }

  // Get contact
  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, enrollment.contactId));
  if (!contact) {
    await exitSequence(enrollment.id, "contact_not_found");
    return;
  }

  // Check exit triggers
  const [sequence] = await db.select().from(emailSequences).where(eq(emailSequences.id, enrollment.sequenceId));
  if (sequence?.exitTriggers) {
    const exitTriggers = JSON.parse(sequence.exitTriggers);
    if (await checkExitTriggers(contact, exitTriggers)) {
      await exitSequence(enrollment.id, "exit_trigger_met");
      return;
    }
  }

  // Execute step based on type
  switch (step.stepType) {
    case "email":
      await executeEmailStep(enrollment, step, contact);
      break;
    case "task":
      await executeTaskStep(enrollment, step, contact);
      break;
    case "wait":
      // Just advance to next step
      break;
    case "condition":
      await executeConditionStep(enrollment, step, contact);
      return; // Condition step handles its own advancement
    case "webhook":
      await executeWebhookStep(enrollment, step, contact);
      break;
  }

  // Log step completion
  await db.insert(emailSequenceEvents).values({
    enrollmentId: enrollment.id,
    stepId: step.id,
    eventType: "step_completed",
  });

  // Update step stats
  await db
    .update(emailSequenceSteps)
    .set({ totalSent: sql`${emailSequenceSteps.totalSent} + 1` })
    .where(eq(emailSequenceSteps.id, step.id));

  // Advance to next step
  await advanceToNextStep(enrollment, step);
}

async function executeEmailStep(enrollment: any, step: any, contact: any): Promise<void> {
  const db = getDb();

  if (!contact.email || contact.optedOutEmail) {
    return;
  }

  // Get deal if associated
  const [deal] = await db
    .select()
    .from(crmDeals)
    .where(eq(crmDeals.contactId, contact.id))
    .orderBy(desc(crmDeals.createdAt))
    .limit(1);

  // Get email content
  let subject = step.subject || "";
  let bodyHtml = step.bodyHtml || "";

  // Use template if specified
  if (step.emailTemplateId) {
    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.id, step.emailTemplateId));
    if (template) {
      subject = template.subject || subject;
      bodyHtml = template.bodyHtml || template.bodyText || bodyHtml;
    }
  }

  // Personalize
  subject = personalizeContent(subject, contact, deal);
  bodyHtml = personalizeContent(bodyHtml, contact, deal);

  // Send email
  await sendEmail({
    to: contact.email,
    subject,
    html: formatEmailHtml(bodyHtml),
  });

  // Log event
  await db.insert(emailSequenceEvents).values({
    enrollmentId: enrollment.id,
    stepId: step.id,
    eventType: "email_sent",
    eventData: JSON.stringify({ to: contact.email, subject }),
  });

  // Update enrollment stats
  await db
    .update(emailSequenceEnrollments)
    .set({ emailsSent: sql`${emailSequenceEnrollments.emailsSent} + 1` })
    .where(eq(emailSequenceEnrollments.id, enrollment.id));

  // Log activity
  await db.insert(salesActivities).values({
    contactId: contact.id,
    activityType: "email_sent",
    subject: `Sequence email: ${subject}`,
    description: `Email sent from sequence step ${step.stepNumber}`,
  });
}

async function executeTaskStep(enrollment: any, step: any, contact: any): Promise<void> {
  const db = getDb();

  await db.insert(salesActivities).values({
    contactId: contact.id,
    activityType: "task_created",
    subject: personalizeContent(step.taskTitle || "Follow up task", contact),
    description: personalizeContent(step.taskDescription || "", contact),
  });

  await db.insert(emailSequenceEvents).values({
    enrollmentId: enrollment.id,
    stepId: step.id,
    eventType: "task_created",
  });
}

async function executeConditionStep(enrollment: any, step: any, contact: any): Promise<void> {
  const db = getDb();
  const config = JSON.parse(step.conditionConfig || "{}");
  let conditionMet = false;

  // Evaluate condition
  switch (step.conditionType) {
    case "email_opened":
      conditionMet = enrollment.emailsOpened > 0;
      break;
    case "email_clicked":
      conditionMet = enrollment.emailsClicked > 0;
      break;
    case "email_replied":
      conditionMet = enrollment.emailsReplied > 0;
      break;
    case "deal_created":
      const deals = await db
        .select()
        .from(crmDeals)
        .where(
          and(
            eq(crmDeals.contactId, contact.id),
            gte(crmDeals.createdAt, enrollment.enrolledAt)
          )
        );
      conditionMet = deals.length > 0;
      break;
    case "tag_present":
      if (config.tagName) {
        const tags = await db
          .select()
          .from(crmContactTags)
          .leftJoin(crmTags, eq(crmContactTags.tagId, crmTags.id))
          .where(
            and(
              eq(crmContactTags.contactId, contact.id),
              eq(crmTags.name, config.tagName)
            )
          );
        conditionMet = tags.length > 0;
      }
      break;
  }

  await db.insert(emailSequenceEvents).values({
    enrollmentId: enrollment.id,
    stepId: step.id,
    eventType: "condition_evaluated",
    eventData: JSON.stringify({ conditionType: step.conditionType, result: conditionMet }),
  });

  // Advance to appropriate next step
  const nextStepNumber = conditionMet ? step.trueNextStep : step.falseNextStep;
  if (nextStepNumber) {
    const [nextStep] = await db
      .select()
      .from(emailSequenceSteps)
      .where(
        and(
          eq(emailSequenceSteps.sequenceId, enrollment.sequenceId),
          eq(emailSequenceSteps.stepNumber, nextStepNumber)
        )
      );

    if (nextStep) {
      const [sequence] = await db.select().from(emailSequences).where(eq(emailSequences.id, enrollment.sequenceId));
      await db
        .update(emailSequenceEnrollments)
        .set({
          currentStepId: nextStep.id,
          currentStepNumber: nextStep.stepNumber,
          nextStepScheduledAt: calculateNextStepTime(nextStep, sequence),
        })
        .where(eq(emailSequenceEnrollments.id, enrollment.id));
      return;
    }
  }

  // No next step found, complete sequence
  await completeSequence(enrollment.id, "completed");
}

async function executeWebhookStep(enrollment: any, step: any, contact: any): Promise<void> {
  const db = getDb();

  if (!step.webhookUrl) return;

  const payload = step.webhookPayload
    ? JSON.parse(personalizeContent(step.webhookPayload, contact))
    : { contact, enrollment, timestamp: new Date().toISOString() };

  await fetch(step.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  await db.insert(emailSequenceEvents).values({
    enrollmentId: enrollment.id,
    stepId: step.id,
    eventType: "webhook_fired",
    eventData: JSON.stringify({ url: step.webhookUrl }),
  });
}

async function advanceToNextStep(enrollment: any, currentStep: any): Promise<void> {
  const db = getDb();

  // Get next step
  const [nextStep] = await db
    .select()
    .from(emailSequenceSteps)
    .where(
      and(
        eq(emailSequenceSteps.sequenceId, enrollment.sequenceId),
        sql`${emailSequenceSteps.stepNumber} > ${currentStep.stepNumber}`,
        eq(emailSequenceSteps.isActive, true)
      )
    )
    .orderBy(asc(emailSequenceSteps.stepNumber))
    .limit(1);

  if (nextStep) {
    const [sequence] = await db.select().from(emailSequences).where(eq(emailSequences.id, enrollment.sequenceId));
    await db
      .update(emailSequenceEnrollments)
      .set({
        currentStepId: nextStep.id,
        currentStepNumber: nextStep.stepNumber,
        nextStepScheduledAt: calculateNextStepTime(nextStep, sequence),
      })
      .where(eq(emailSequenceEnrollments.id, enrollment.id));
  } else {
    await completeSequence(enrollment.id, "completed");
  }
}

async function completeSequence(enrollmentId: number, reason: string): Promise<void> {
  const db = getDb();

  const [enrollment] = await db
    .select()
    .from(emailSequenceEnrollments)
    .where(eq(emailSequenceEnrollments.id, enrollmentId));

  await db
    .update(emailSequenceEnrollments)
    .set({
      status: "completed",
      completedAt: new Date(),
      nextStepScheduledAt: null,
    })
    .where(eq(emailSequenceEnrollments.id, enrollmentId));

  await db.insert(emailSequenceEvents).values({
    enrollmentId,
    eventType: "sequence_completed",
    eventData: JSON.stringify({ reason }),
  });

  // Update sequence stats
  if (enrollment) {
    await db
      .update(emailSequences)
      .set({ totalCompleted: sql`${emailSequences.totalCompleted} + 1` })
      .where(eq(emailSequences.id, enrollment.sequenceId));
  }
}

async function exitSequence(enrollmentId: number, reason: string): Promise<void> {
  const db = getDb();

  await db
    .update(emailSequenceEnrollments)
    .set({
      status: "exited",
      exitReason: reason,
      exitedAt: new Date(),
      nextStepScheduledAt: null,
    })
    .where(eq(emailSequenceEnrollments.id, enrollmentId));

  await db.insert(emailSequenceEvents).values({
    enrollmentId,
    eventType: "exited",
    eventData: JSON.stringify({ reason }),
  });
}

async function checkExitTriggers(contact: any, exitTriggers: any): Promise<boolean> {
  // Check various exit trigger conditions
  if (exitTriggers.replied && contact.lastRepliedAt) return true;
  if (exitTriggers.dealCreated) {
    const db = getDb();
    const recentDeals = await db
      .select()
      .from(crmDeals)
      .where(
        and(
          eq(crmDeals.contactId, contact.id),
          eq(crmDeals.status, "open")
        )
      );
    if (recentDeals.length > 0) return true;
  }
  if (exitTriggers.unsubscribed && contact.optedOutEmail) return true;
  return false;
}

// ============================================
// COMMISSION CALCULATION ENGINE
// ============================================

export interface CommissionCalculation {
  userId: number;
  dealId: number;
  dealAmount: number;
  commissionRate: number;
  commissionAmount: number;
  planId: number;
  assignmentId: number;
}

/**
 * Calculate commission for a won deal
 */
export async function calculateDealCommission(
  dealId: number,
  ctx: SalesAutomationContext
): Promise<CommissionCalculation | null> {
  const db = getDb();

  // Get deal
  const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId));
  if (!deal || deal.status !== "won" || !deal.assignedTo || !deal.amount) {
    return null;
  }

  // Get user's commission assignment
  const [assignment] = await db
    .select()
    .from(commissionAssignments)
    .where(
      and(
        eq(commissionAssignments.userId, deal.assignedTo),
        eq(commissionAssignments.isActive, true),
        or(
          isNull(commissionAssignments.expirationDate),
          gte(commissionAssignments.expirationDate, new Date())
        )
      )
    );

  if (!assignment) {
    return null;
  }

  // Get commission plan
  const [plan] = await db
    .select()
    .from(commissionPlans)
    .where(eq(commissionPlans.id, assignment.planId));

  if (!plan) {
    return null;
  }

  const dealAmount = Number(deal.amount);
  let commissionRate = 0;
  let commissionAmount = 0;

  // Calculate based on plan type
  const rateStructure = assignment.customRateStructure
    ? JSON.parse(assignment.customRateStructure)
    : JSON.parse(plan.rateStructure);

  switch (plan.type) {
    case "flat_rate":
      commissionRate = rateStructure.rate || 0;
      commissionAmount = dealAmount * (commissionRate / 100);
      break;

    case "tiered":
      // Get user's YTD revenue to determine tier
      const [ytdStats] = await db
        .select({
          ytdRevenue: sql<number>`COALESCE(SUM(${commissionTransactions.dealAmount}), 0)`,
        })
        .from(commissionTransactions)
        .where(
          and(
            eq(commissionTransactions.userId, deal.assignedTo),
            eq(commissionTransactions.transactionType, "earned"),
            sql`YEAR(${commissionTransactions.createdAt}) = YEAR(CURDATE())`
          )
        );

      const ytdRevenue = Number(ytdStats?.ytdRevenue || 0);
      const tiers = rateStructure.tiers || [];

      // Find applicable tier
      for (const tier of tiers.sort((a: any, b: any) => (b.min || 0) - (a.min || 0))) {
        if (ytdRevenue >= (tier.min || 0)) {
          commissionRate = tier.rate;
          break;
        }
      }

      commissionAmount = dealAmount * (commissionRate / 100);
      break;

    case "accelerator":
      // Accelerators increase rate after quota attainment
      const [currentQuota] = await db
        .select()
        .from(salesQuotas)
        .where(
          and(
            eq(salesQuotas.userId, deal.assignedTo),
            eq(salesQuotas.status, "active"),
            lte(salesQuotas.periodStart, new Date()),
            gte(salesQuotas.periodEnd, new Date())
          )
        );

      const attainment = currentQuota
        ? (Number(currentQuota.revenueAchieved) / Number(currentQuota.revenueQuota)) * 100
        : 0;

      commissionRate = rateStructure.base || 0;
      if (rateStructure.accelerators) {
        for (const acc of rateStructure.accelerators.sort((a: any, b: any) => b.threshold - a.threshold)) {
          if (attainment >= acc.threshold) {
            commissionRate = acc.rate;
            break;
          }
        }
      }

      commissionAmount = dealAmount * (commissionRate / 100);
      break;

    case "hybrid":
      // Combination of base + tiered
      const baseAmount = dealAmount * ((rateStructure.base || 0) / 100);
      let bonusAmount = 0;

      if (rateStructure.bonusTiers) {
        // Apply bonus based on conditions
      }

      commissionAmount = baseAmount + bonusAmount;
      commissionRate = (commissionAmount / dealAmount) * 100;
      break;

    default:
      commissionRate = rateStructure.rate || rateStructure.base || 10;
      commissionAmount = dealAmount * (commissionRate / 100);
  }

  // Apply caps
  if (plan.maxPayout && commissionAmount > Number(plan.maxPayout)) {
    commissionAmount = Number(plan.maxPayout);
  }
  if (plan.minPayout && commissionAmount < Number(plan.minPayout)) {
    commissionAmount = Number(plan.minPayout);
  }

  // Create commission transaction
  const earnedPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
  await db.insert(commissionTransactions).values({
    userId: deal.assignedTo,
    assignmentId: assignment.id,
    dealId: deal.id,
    transactionType: "earned",
    dealAmount: deal.amount,
    commissionRate: commissionRate.toFixed(4),
    commissionAmount: commissionAmount.toFixed(2),
    status: "pending",
    earnedPeriod,
  });

  return {
    userId: deal.assignedTo,
    dealId: deal.id,
    dealAmount,
    commissionRate,
    commissionAmount,
    planId: plan.id,
    assignmentId: assignment.id,
  };
}

// ============================================
// SALES FORECASTING ENGINE
// ============================================

export interface ForecastData {
  period: string;
  commitAmount: number;
  bestCaseAmount: number;
  pipelineAmount: number;
  weightedAmount: number;
  aiPredictedAmount?: number;
}

/**
 * Generate or update sales forecast for a period
 */
export async function generateSalesForecast(
  period: string, // YYYY-MM or YYYY-Q1
  options: {
    userId?: number;
    territoryId?: number;
    pipelineId?: number;
    useAI?: boolean;
  } = {},
  ctx?: SalesAutomationContext
): Promise<ForecastData> {
  const db = getDb();

  const periodType = period.includes("Q") ? "quarterly" : "monthly";

  // Determine period date range
  let periodStart: Date;
  let periodEnd: Date;

  if (periodType === "quarterly") {
    const [year, quarter] = period.split("-Q");
    const quarterStartMonth = (parseInt(quarter) - 1) * 3;
    periodStart = new Date(parseInt(year), quarterStartMonth, 1);
    periodEnd = new Date(parseInt(year), quarterStartMonth + 3, 0);
  } else {
    const [year, month] = period.split("-");
    periodStart = new Date(parseInt(year), parseInt(month) - 1, 1);
    periodEnd = new Date(parseInt(year), parseInt(month), 0);
  }

  // Build deal query conditions
  const conditions: any[] = [
    eq(crmDeals.status, "open"),
    lte(crmDeals.expectedCloseDate, periodEnd),
  ];

  if (options.userId) conditions.push(eq(crmDeals.assignedTo, options.userId));
  if (options.pipelineId) conditions.push(eq(crmDeals.pipelineId, options.pipelineId));

  // Get all open deals expected to close in period
  const deals = await db
    .select()
    .from(crmDeals)
    .where(and(...conditions));

  // Categorize deals by probability
  let commitAmount = 0;
  let bestCaseAmount = 0;
  let pipelineAmount = 0;
  let weightedAmount = 0;

  let commitCount = 0;
  let bestCaseCount = 0;
  let pipelineCount = 0;

  for (const deal of deals) {
    const amount = Number(deal.amount) || 0;
    const probability = deal.probability || 0;

    pipelineAmount += amount;
    pipelineCount++;
    weightedAmount += amount * (probability / 100);

    if (probability >= 90) {
      commitAmount += amount;
      commitCount++;
    } else if (probability >= 70) {
      bestCaseAmount += amount;
      bestCaseCount++;
    }
  }

  // Best case includes commit
  bestCaseAmount += commitAmount;
  bestCaseCount += commitCount;

  // AI prediction (optional)
  let aiPredictedAmount: number | undefined;
  let aiConfidence: number | undefined;
  let aiReasoning: string | undefined;

  if (options.useAI) {
    try {
      const historicalData = await getHistoricalSalesData(options);
      const aiPrediction = await predictSalesWithAI(deals, historicalData, period);
      aiPredictedAmount = aiPrediction.predictedAmount;
      aiConfidence = aiPrediction.confidence;
      aiReasoning = aiPrediction.reasoning;
    } catch (error) {
      console.error("AI prediction failed:", error);
    }
  }

  // Upsert forecast record
  const existingForecast = await db
    .select()
    .from(salesForecasts)
    .where(
      and(
        eq(salesForecasts.forecastPeriod, period),
        options.userId ? eq(salesForecasts.userId, options.userId) : isNull(salesForecasts.userId),
        options.territoryId ? eq(salesForecasts.territoryId, options.territoryId) : isNull(salesForecasts.territoryId),
        options.pipelineId ? eq(salesForecasts.pipelineId, options.pipelineId) : isNull(salesForecasts.pipelineId)
      )
    )
    .limit(1);

  const forecastData = {
    forecastPeriod: period,
    periodType,
    userId: options.userId || null,
    territoryId: options.territoryId || null,
    pipelineId: options.pipelineId || null,
    commitAmount: commitAmount.toFixed(2),
    commitDealCount: commitCount,
    bestCaseAmount: bestCaseAmount.toFixed(2),
    bestCaseDealCount: bestCaseCount,
    pipelineAmount: pipelineAmount.toFixed(2),
    pipelineDealCount: pipelineCount,
    weightedAmount: weightedAmount.toFixed(2),
    aiPredictedAmount: aiPredictedAmount?.toFixed(2),
    aiConfidence: aiConfidence?.toFixed(2),
    aiReasoning,
    lastUpdated: new Date(),
  };

  if (existingForecast.length > 0) {
    await db
      .update(salesForecasts)
      .set(forecastData)
      .where(eq(salesForecasts.id, existingForecast[0].id));
  } else {
    await db.insert(salesForecasts).values(forecastData as any);
  }

  return {
    period,
    commitAmount,
    bestCaseAmount,
    pipelineAmount,
    weightedAmount,
    aiPredictedAmount,
  };
}

async function getHistoricalSalesData(options: any): Promise<any[]> {
  const db = getDb();

  // Get last 12 months of won deals
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const conditions: any[] = [
    eq(crmDeals.status, "won"),
    gte(crmDeals.wonAt, twelveMonthsAgo),
  ];

  if (options.userId) conditions.push(eq(crmDeals.assignedTo, options.userId));
  if (options.pipelineId) conditions.push(eq(crmDeals.pipelineId, options.pipelineId));

  return db
    .select({
      month: sql<string>`DATE_FORMAT(${crmDeals.wonAt}, '%Y-%m')`,
      totalAmount: sql<number>`SUM(${crmDeals.amount})`,
      dealCount: sql<number>`COUNT(*)`,
    })
    .from(crmDeals)
    .where(and(...conditions))
    .groupBy(sql`DATE_FORMAT(${crmDeals.wonAt}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${crmDeals.wonAt}, '%Y-%m')`);
}

async function predictSalesWithAI(
  currentDeals: any[],
  historicalData: any[],
  period: string
): Promise<{ predictedAmount: number; confidence: number; reasoning: string }> {
  const messages: Message[] = [
    {
      role: "user",
      content: `Analyze this sales data and predict the likely revenue for ${period}.

Historical monthly sales (last 12 months):
${JSON.stringify(historicalData, null, 2)}

Current open deals expected to close in ${period}:
${JSON.stringify(
        currentDeals.map((d) => ({
          name: d.name,
          amount: d.amount,
          probability: d.probability,
          stage: d.stage,
          daysInPipeline: Math.floor(
            (Date.now() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24)
          ),
        })),
        null,
        2
      )}

Provide your prediction in JSON format:
{
  "predictedAmount": <number>,
  "confidence": <0-1>,
  "reasoning": "<brief explanation>"
}`,
    },
  ];

  const response = await invokeLLM(messages, {
    maxTokens: 1000,
    model: "claude-3-haiku-20240307",
  });

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const prediction = JSON.parse(jsonMatch[0]);
      return {
        predictedAmount: prediction.predictedAmount || 0,
        confidence: prediction.confidence || 0.5,
        reasoning: prediction.reasoning || "AI prediction based on historical trends",
      };
    }
  } catch (error) {
    console.error("Failed to parse AI prediction:", error);
  }

  // Fallback to simple weighted average
  const totalHistorical = historicalData.reduce((sum, m) => sum + Number(m.totalAmount || 0), 0);
  const avgMonthly = totalHistorical / Math.max(historicalData.length, 1);

  return {
    predictedAmount: avgMonthly,
    confidence: 0.3,
    reasoning: "Fallback to historical average",
  };
}

// ============================================
// QUOTA TRACKING
// ============================================

/**
 * Update quota attainment when a deal is won
 */
export async function updateQuotaAttainment(
  userId: number,
  dealAmount: number,
  dealType: "new_business" | "renewal" | "upsell" = "new_business"
): Promise<void> {
  const db = getDb();

  // Get active quotas for user
  const quotas = await db
    .select()
    .from(salesQuotas)
    .where(
      and(
        eq(salesQuotas.userId, userId),
        eq(salesQuotas.status, "active"),
        lte(salesQuotas.periodStart, new Date()),
        gte(salesQuotas.periodEnd, new Date())
      )
    );

  for (const quota of quotas) {
    const updates: any = {
      revenueAchieved: sql`${salesQuotas.revenueAchieved} + ${dealAmount}`,
      dealCountAchieved: sql`${salesQuotas.dealCountAchieved} + 1`,
    };

    // Update specific quota type
    switch (dealType) {
      case "new_business":
        updates.newBusinessAchieved = sql`${salesQuotas.newBusinessAchieved} + ${dealAmount}`;
        break;
      case "renewal":
        updates.renewalAchieved = sql`${salesQuotas.renewalAchieved} + ${dealAmount}`;
        break;
      case "upsell":
        updates.upsellAchieved = sql`${salesQuotas.upsellAchieved} + ${dealAmount}`;
        break;
    }

    await db.update(salesQuotas).set(updates).where(eq(salesQuotas.id, quota.id));

    // Recalculate attainment percentage
    const [updated] = await db.select().from(salesQuotas).where(eq(salesQuotas.id, quota.id));
    if (updated) {
      const attainment = Number(updated.revenueQuota) > 0
        ? (Number(updated.revenueAchieved) / Number(updated.revenueQuota)) * 100
        : 0;

      await db
        .update(salesQuotas)
        .set({ attainmentPercent: attainment.toFixed(2) })
        .where(eq(salesQuotas.id, quota.id));
    }
  }
}

// ============================================
// DAILY METRICS AGGREGATION
// ============================================

/**
 * Aggregate daily sales metrics (run via cron)
 */
export async function aggregateDailyMetrics(date?: Date): Promise<void> {
  const db = getDb();
  const targetDate = date || new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  // Get all users with deals
  const usersWithActivity = await db
    .selectDistinct({ userId: crmDeals.assignedTo })
    .from(crmDeals)
    .where(isNotNull(crmDeals.assignedTo));

  for (const { userId } of usersWithActivity) {
    if (!userId) continue;

    // Get metrics for the day
    const [dealMetrics] = await db
      .select({
        newDealsCount: sql<number>`SUM(CASE WHEN DATE(${crmDeals.createdAt}) = DATE(${dayStart}) THEN 1 ELSE 0 END)`,
        newDealsValue: sql<number>`SUM(CASE WHEN DATE(${crmDeals.createdAt}) = DATE(${dayStart}) THEN ${crmDeals.amount} ELSE 0 END)`,
        wonDealsCount: sql<number>`SUM(CASE WHEN DATE(${crmDeals.wonAt}) = DATE(${dayStart}) THEN 1 ELSE 0 END)`,
        wonDealsValue: sql<number>`SUM(CASE WHEN DATE(${crmDeals.wonAt}) = DATE(${dayStart}) THEN ${crmDeals.amount} ELSE 0 END)`,
        lostDealsCount: sql<number>`SUM(CASE WHEN DATE(${crmDeals.lostAt}) = DATE(${dayStart}) THEN 1 ELSE 0 END)`,
        lostDealsValue: sql<number>`SUM(CASE WHEN DATE(${crmDeals.lostAt}) = DATE(${dayStart}) THEN ${crmDeals.amount} ELSE 0 END)`,
        pipelineValue: sql<number>`SUM(CASE WHEN ${crmDeals.status} = 'open' THEN ${crmDeals.amount} ELSE 0 END)`,
        weightedPipeline: sql<number>`SUM(CASE WHEN ${crmDeals.status} = 'open' THEN ${crmDeals.amount} * ${crmDeals.probability} / 100 ELSE 0 END)`,
      })
      .from(crmDeals)
      .where(eq(crmDeals.assignedTo, userId));

    const [activityMetrics] = await db
      .select({
        emailsSent: sql<number>`SUM(CASE WHEN ${salesActivities.activityType} = 'email_sent' THEN 1 ELSE 0 END)`,
        callsMade: sql<number>`SUM(CASE WHEN ${salesActivities.activityType} IN ('call_made', 'call_received') THEN 1 ELSE 0 END)`,
        meetingsCompleted: sql<number>`SUM(CASE WHEN ${salesActivities.activityType} = 'meeting_completed' THEN 1 ELSE 0 END)`,
        proposalsSent: sql<number>`SUM(CASE WHEN ${salesActivities.activityType} = 'proposal_sent' THEN 1 ELSE 0 END)`,
        totalActivities: sql<number>`COUNT(*)`,
      })
      .from(salesActivities)
      .where(
        and(
          eq(salesActivities.performedBy, userId),
          gte(salesActivities.activityDate, dayStart),
          lte(salesActivities.activityDate, dayEnd)
        )
      );

    // Upsert daily metrics
    await db
      .insert(salesMetricsDaily)
      .values({
        metricDate: dayStart,
        userId,
        newDealsCount: dealMetrics?.newDealsCount || 0,
        newDealsValue: String(dealMetrics?.newDealsValue || 0),
        wonDealsCount: dealMetrics?.wonDealsCount || 0,
        wonDealsValue: String(dealMetrics?.wonDealsValue || 0),
        lostDealsCount: dealMetrics?.lostDealsCount || 0,
        lostDealsValue: String(dealMetrics?.lostDealsValue || 0),
        emailsSent: activityMetrics?.emailsSent || 0,
        callsMade: activityMetrics?.callsMade || 0,
        meetingsCompleted: activityMetrics?.meetingsCompleted || 0,
        proposalsSent: activityMetrics?.proposalsSent || 0,
        totalActivities: activityMetrics?.totalActivities || 0,
        pipelineValue: String(dealMetrics?.pipelineValue || 0),
        weightedPipeline: String(dealMetrics?.weightedPipeline || 0),
      })
      .onDuplicateKeyUpdate({
        set: {
          newDealsCount: dealMetrics?.newDealsCount || 0,
          newDealsValue: String(dealMetrics?.newDealsValue || 0),
          wonDealsCount: dealMetrics?.wonDealsCount || 0,
          wonDealsValue: String(dealMetrics?.wonDealsValue || 0),
          lostDealsCount: dealMetrics?.lostDealsCount || 0,
          lostDealsValue: String(dealMetrics?.lostDealsValue || 0),
          emailsSent: activityMetrics?.emailsSent || 0,
          callsMade: activityMetrics?.callsMade || 0,
          meetingsCompleted: activityMetrics?.meetingsCompleted || 0,
          proposalsSent: activityMetrics?.proposalsSent || 0,
          totalActivities: activityMetrics?.totalActivities || 0,
          pipelineValue: String(dealMetrics?.pipelineValue || 0),
          weightedPipeline: String(dealMetrics?.weightedPipeline || 0),
          updatedAt: new Date(),
        },
      });
  }
}

// ============================================
// LEADERBOARD GENERATION
// ============================================

/**
 * Generate leaderboard snapshot
 */
export async function generateLeaderboardSnapshot(
  periodType: "daily" | "weekly" | "monthly" | "quarterly" | "annual"
): Promise<void> {
  const db = getDb();

  // Calculate period boundaries
  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date = now;

  switch (periodType) {
    case "daily":
      periodStart = new Date(now);
      periodStart.setHours(0, 0, 0, 0);
      break;
    case "weekly":
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - now.getDay());
      periodStart.setHours(0, 0, 0, 0);
      break;
    case "monthly":
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "quarterly":
      const quarter = Math.floor(now.getMonth() / 3);
      periodStart = new Date(now.getFullYear(), quarter * 3, 1);
      break;
    case "annual":
      periodStart = new Date(now.getFullYear(), 0, 1);
      break;
  }

  // Get revenue rankings
  const revenueRankings = await db
    .select({
      userId: crmDeals.assignedTo,
      value: sql<number>`SUM(${crmDeals.amount})`,
    })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.status, "won"),
        gte(crmDeals.wonAt, periodStart),
        lte(crmDeals.wonAt, periodEnd),
        isNotNull(crmDeals.assignedTo)
      )
    )
    .groupBy(crmDeals.assignedTo)
    .orderBy(desc(sql`SUM(${crmDeals.amount})`))
    .limit(50);

  // Get deal count rankings
  const dealCountRankings = await db
    .select({
      userId: crmDeals.assignedTo,
      value: sql<number>`COUNT(*)`,
    })
    .from(crmDeals)
    .where(
      and(
        eq(crmDeals.status, "won"),
        gte(crmDeals.wonAt, periodStart),
        lte(crmDeals.wonAt, periodEnd),
        isNotNull(crmDeals.assignedTo)
      )
    )
    .groupBy(crmDeals.assignedTo)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(50);

  // Get activity rankings
  const activityRankings = await db
    .select({
      userId: salesActivities.performedBy,
      value: sql<number>`COUNT(*)`,
    })
    .from(salesActivities)
    .where(
      and(
        gte(salesActivities.activityDate, periodStart),
        lte(salesActivities.activityDate, periodEnd),
        isNotNull(salesActivities.performedBy)
      )
    )
    .groupBy(salesActivities.performedBy)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(50);

  // Add rankings with position
  const addRanks = (data: any[]) =>
    data.map((item, index) => ({
      userId: item.userId,
      rank: index + 1,
      value: Number(item.value),
    }));

  await db.insert(salesLeaderboardSnapshots).values({
    periodType,
    periodStart,
    periodEnd,
    revenueRankings: JSON.stringify(addRanks(revenueRankings)),
    dealCountRankings: JSON.stringify(addRanks(dealCountRankings)),
    activityRankings: JSON.stringify(addRanks(activityRankings)),
    snapshotAt: now,
  });
}

// ============================================
// FOLLOW-UP AUTOMATION
// ============================================

/**
 * Check for contacts needing follow-up and create automation tasks
 */
export async function processFollowUpReminders(): Promise<{ remindersCreated: number }> {
  const db = getDb();
  let remindersCreated = 0;

  // Get contacts with overdue follow-ups
  const overdueContacts = await db
    .select()
    .from(crmContacts)
    .where(
      and(
        lte(crmContacts.nextFollowUpAt, new Date()),
        eq(crmContacts.status, "active"),
        or(
          eq(crmContacts.contactType, "lead"),
          eq(crmContacts.contactType, "prospect")
        )
      )
    )
    .limit(100);

  // Find automation rules for follow-up
  const followUpRules = await db
    .select()
    .from(salesAutomationRules)
    .where(
      and(
        eq(salesAutomationRules.isActive, true),
        eq(salesAutomationRules.triggerType, "follow_up_due")
      )
    );

  for (const contact of overdueContacts) {
    for (const rule of followUpRules) {
      // Check cooldown
      if (rule.cooldownMinutes) {
        const [recentExecution] = await db
          .select()
          .from(salesAutomationExecutions)
          .where(
            and(
              eq(salesAutomationExecutions.ruleId, rule.id),
              eq(salesAutomationExecutions.contactId, contact.id),
              gte(
                salesAutomationExecutions.createdAt,
                new Date(Date.now() - rule.cooldownMinutes * 60000)
              )
            )
          )
          .limit(1);

        if (recentExecution) continue;
      }

      // Create execution
      await db.insert(salesAutomationExecutions).values({
        ruleId: rule.id,
        contactId: contact.id,
        triggerEvent: "follow_up_due",
        triggerData: JSON.stringify({
          nextFollowUpAt: contact.nextFollowUpAt,
          lastContactedAt: contact.lastContactedAt,
        }),
        status: "pending",
        scheduledFor: rule.delayMinutes ? new Date(Date.now() + rule.delayMinutes * 60000) : new Date(),
      });

      remindersCreated++;
    }
  }

  return { remindersCreated };
}

// ============================================
// DEAL WIN/LOSS PROCESSING
// ============================================

/**
 * Process when a deal is won
 */
export async function processDealWon(
  dealId: number,
  ctx: SalesAutomationContext
): Promise<void> {
  const db = getDb();

  const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId));
  if (!deal) return;

  // Update deal
  await db
    .update(crmDeals)
    .set({
      status: "won",
      wonAt: new Date(),
      probability: 100,
    })
    .where(eq(crmDeals.id, dealId));

  // Update contact type
  await db
    .update(crmContacts)
    .set({ contactType: "customer" })
    .where(eq(crmContacts.id, deal.contactId));

  // Calculate commission
  await calculateDealCommission(dealId, ctx);

  // Update quota
  if (deal.assignedTo && deal.amount) {
    await updateQuotaAttainment(deal.assignedTo, Number(deal.amount), "new_business");
  }

  // Log activity
  await db.insert(salesActivities).values({
    dealId,
    contactId: deal.contactId,
    activityType: "deal_won",
    subject: `Deal won: ${deal.name}`,
    description: `Deal worth ${deal.currency || "USD"} ${deal.amount} was closed won`,
    revenueImpact: deal.amount,
    performedBy: ctx.userId,
  });

  // Stage history
  await db.insert(dealStageHistory).values({
    dealId,
    fromStage: deal.stage,
    toStage: "won",
    changedBy: ctx.userId,
    previousProbability: deal.probability,
    newProbability: 100,
  });

  // Trigger automations
  const wonRules = await db
    .select()
    .from(salesAutomationRules)
    .where(
      and(
        eq(salesAutomationRules.isActive, true),
        eq(salesAutomationRules.triggerType, "deal_won")
      )
    );

  for (const rule of wonRules) {
    await db.insert(salesAutomationExecutions).values({
      ruleId: rule.id,
      dealId,
      contactId: deal.contactId,
      triggerEvent: "deal_won",
      triggerData: JSON.stringify({ dealAmount: deal.amount, dealName: deal.name }),
      status: "pending",
    });
  }

  // === REVENUE INTELLIGENCE INTEGRATION ===
  // Update account health score
  if (deal.accountId) {
    try {
      await revenueIntelligence.calculateAccountHealth(deal.accountId);
    } catch (e) {
      console.warn(`[RevIntel] Account health update failed for account ${deal.accountId}:`, e);
    }
  }

  // Audit log
  try {
    await revenueIntelligence.logSalesAudit("deal", dealId, "won", { amount: deal.amount }, ctx);
  } catch (e) {
    console.warn(`[RevIntel] Audit log failed for deal ${dealId}:`, e);
  }
}

/**
 * Process when a deal is lost
 */
export async function processDealLost(
  dealId: number,
  lostReason: string,
  ctx: SalesAutomationContext
): Promise<void> {
  const db = getDb();

  const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId));
  if (!deal) return;

  // Update deal
  await db
    .update(crmDeals)
    .set({
      status: "lost",
      lostAt: new Date(),
      lostReason,
      probability: 0,
    })
    .where(eq(crmDeals.id, dealId));

  // Log activity
  await db.insert(salesActivities).values({
    dealId,
    contactId: deal.contactId,
    activityType: "deal_lost",
    subject: `Deal lost: ${deal.name}`,
    description: `Reason: ${lostReason}`,
    performedBy: ctx.userId,
  });

  // Stage history
  await db.insert(dealStageHistory).values({
    dealId,
    fromStage: deal.stage,
    toStage: "lost",
    changedBy: ctx.userId,
    changeReason: lostReason,
    previousProbability: deal.probability,
    newProbability: 0,
  });

  // Trigger automations
  const lostRules = await db
    .select()
    .from(salesAutomationRules)
    .where(
      and(
        eq(salesAutomationRules.isActive, true),
        eq(salesAutomationRules.triggerType, "deal_lost")
      )
    );

  for (const rule of lostRules) {
    await db.insert(salesAutomationExecutions).values({
      ruleId: rule.id,
      dealId,
      contactId: deal.contactId,
      triggerEvent: "deal_lost",
      triggerData: JSON.stringify({ lostReason, dealAmount: deal.amount }),
      status: "pending",
    });
  }
}

// ============================================
// STALLED DEAL DETECTION
// ============================================

/**
 * Detect and process stalled deals
 */
export async function detectStalledDeals(
  stalledDays: number = 14
): Promise<{ stalledDeals: number }> {
  const db = getDb();

  const stalledDate = new Date();
  stalledDate.setDate(stalledDate.getDate() - stalledDays);

  // Find deals that haven't had activity in stalledDays
  const potentiallyStalledDeals = await db
    .select({
      deal: crmDeals,
      lastActivity: sql<Date>`MAX(${salesActivities.activityDate})`,
    })
    .from(crmDeals)
    .leftJoin(salesActivities, eq(crmDeals.id, salesActivities.dealId))
    .where(eq(crmDeals.status, "open"))
    .groupBy(crmDeals.id)
    .having(
      or(
        isNull(sql`MAX(${salesActivities.activityDate})`),
        lte(sql`MAX(${salesActivities.activityDate})`, stalledDate)
      )
    );

  let stalledCount = 0;

  for (const { deal } of potentiallyStalledDeals) {
    // Mark as stalled if not already
    if (deal.status === "open") {
      await db
        .update(crmDeals)
        .set({ status: "stalled" })
        .where(eq(crmDeals.id, deal.id));

      // Trigger stalled automations
      const stalledRules = await db
        .select()
        .from(salesAutomationRules)
        .where(
          and(
            eq(salesAutomationRules.isActive, true),
            eq(salesAutomationRules.triggerType, "deal_stalled")
          )
        );

      for (const rule of stalledRules) {
        await db.insert(salesAutomationExecutions).values({
          ruleId: rule.id,
          dealId: deal.id,
          contactId: deal.contactId,
          triggerEvent: "deal_stalled",
          triggerData: JSON.stringify({ stalledDays, dealName: deal.name }),
          status: "pending",
        });
      }

      stalledCount++;
    }
  }

  return { stalledDeals: stalledCount };
}

// ============================================
// SCHEDULED AUTOMATION EXECUTOR
// ============================================

/**
 * Execute pending scheduled automations (called by scheduler)
 */
export async function executePendingAutomations(): Promise<{ executed: number; errors: number }> {
  const db = getDb();
  let executed = 0;
  let errors = 0;

  // Get pending executions that are due
  const pendingExecutions = await db
    .select()
    .from(salesAutomationExecutions)
    .where(
      and(
        eq(salesAutomationExecutions.status, "pending"),
        or(
          isNull(salesAutomationExecutions.scheduledFor),
          lte(salesAutomationExecutions.scheduledFor, new Date())
        )
      )
    )
    .limit(50);

  for (const execution of pendingExecutions) {
    try {
      // Get the rule
      const [rule] = await db
        .select()
        .from(salesAutomationRules)
        .where(eq(salesAutomationRules.id, execution.ruleId));

      if (!rule || !rule.isActive) {
        await db
          .update(salesAutomationExecutions)
          .set({ status: "cancelled" })
          .where(eq(salesAutomationExecutions.id, execution.id));
        continue;
      }

      // Mark as running
      await db
        .update(salesAutomationExecutions)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(salesAutomationExecutions.id, execution.id));

      // Get deal if exists
      let deal = null;
      if (execution.dealId) {
        [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, execution.dealId));
      }

      // Execute actions
      const ctx: SalesAutomationContext = { userId: 0 }; // System context
      const actions = await executeAutomationActions(rule, deal || { contactId: execution.contactId }, ctx);

      // Mark as completed
      await db
        .update(salesAutomationExecutions)
        .set({
          status: "completed",
          completedAt: new Date(),
          actionsExecuted: JSON.stringify(actions),
        })
        .where(eq(salesAutomationExecutions.id, execution.id));

      executed++;
    } catch (error: any) {
      errors++;

      await db
        .update(salesAutomationExecutions)
        .set({
          status: "failed",
          errorMessage: error.message,
          retryCount: sql`${salesAutomationExecutions.retryCount} + 1`,
        })
        .where(eq(salesAutomationExecutions.id, execution.id));
    }
  }

  return { executed, errors };
}

// ============================================
// REVENUE INTELLIGENCE SCHEDULED TASKS
// ============================================

/**
 * Update risk scores for all active deals (scheduled task)
 */
export async function updateAllDealRiskScores(): Promise<{ updated: number; errors: number }> {
  const db = getDb();
  let updated = 0;
  let errors = 0;

  const activeDeals = await db
    .select()
    .from(crmDeals)
    .where(eq(crmDeals.status, "open"))
    .limit(100); // Process in batches

  for (const deal of activeDeals) {
    try {
      await revenueIntelligence.calculateDealRiskScore(deal.id, { userId: deal.assignedTo || 1 });
      updated++;
    } catch (e) {
      errors++;
      console.warn(`[RevIntel] Risk score update failed for deal ${deal.id}:`, e);
    }
  }

  return { updated, errors };
}

/**
 * Update engagement scores for all active contacts (scheduled task)
 */
export async function updateAllContactEngagement(): Promise<{ updated: number; errors: number }> {
  const db = getDb();
  let updated = 0;
  let errors = 0;

  // Get contacts with recent activity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const activeContacts = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(gte(crmContacts.lastContactedAt, thirtyDaysAgo))
    .limit(200);

  for (const contact of activeContacts) {
    try {
      await revenueIntelligence.updateContactEngagement(contact.id);
      updated++;
    } catch (e) {
      errors++;
    }
  }

  return { updated, errors };
}

/**
 * Generate meeting prep briefs for upcoming meetings (scheduled task)
 */
export async function generateUpcomingMeetingBriefs(): Promise<{ generated: number; errors: number }> {
  const db = getDb();
  let generated = 0;
  let errors = 0;

  // Get meetings in the next 24 hours
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const upcomingMeetings = await db
    .select()
    .from(meetingTracking)
    .where(
      and(
        gte(meetingTracking.startTime, now),
        lte(meetingTracking.startTime, tomorrow),
        eq(meetingTracking.status, "scheduled")
      )
    );

  for (const meeting of upcomingMeetings) {
    try {
      // Check if brief already exists
      const existingBrief = await db
        .select()
        .from(meetingPrepBriefs)
        .where(eq(meetingPrepBriefs.meetingId, meeting.id))
        .limit(1);

      if (existingBrief.length === 0) {
        await revenueIntelligence.generateMeetingPrepBrief(meeting.id, { userId: meeting.userId });
        generated++;
      }
    } catch (e) {
      errors++;
      console.warn(`[RevIntel] Meeting brief generation failed for meeting ${meeting.id}:`, e);
    }
  }

  return { generated, errors };
}

/**
 * Calculate pipeline health for all pipelines (scheduled task)
 */
export async function updateAllPipelineHealth(): Promise<{ updated: number; errors: number }> {
  const db = getDb();
  let updated = 0;
  let errors = 0;

  const pipelines = await db.select().from(crmPipelines).where(eq(crmPipelines.isActive, true));

  for (const pipeline of pipelines) {
    try {
      await revenueIntelligence.calculatePipelineHealth(pipeline.id);
      updated++;
    } catch (e) {
      errors++;
    }
  }

  return { updated, errors };
}

// Export all functions for use in routes
export {
  personalizeContent,
  calculateNextStepTime,
};
