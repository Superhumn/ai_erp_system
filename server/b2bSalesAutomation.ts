import { invokeLLM, type Message } from "./_core/llm";
import { getDb } from "./db";
import { sendEmail, formatEmailHtml } from "./_core/email";
import {
  crmContacts,
  crmDeals,
  crmPipelines,
  crmInteractions,
  crmTags,
  crmContactTags,
  salesSequences,
  salesSequenceSteps,
  salesSequenceEnrollments,
  leadScoringRules,
  salesProposals,
  salesProposalItems,
  salesAutomationRules,
  salesAutomationLog,
  salesTasks,
  salesForecasts,
  products,
  customers,
  salesOrders,
  salesOrderLines,
  sentEmails,
} from "../drizzle/schema";
import { eq, and, desc, asc, sql, gte, lte, lt, or, inArray, isNull, isNotNull } from "drizzle-orm";
import { nanoid } from "nanoid";

// ============================================
// B2B SALES AUTOMATION ENGINE
// Automates the entire B2B sales lifecycle
// ============================================

// --- Lead Scoring Engine ---

export async function calculateLeadScore(contactId: number): Promise<{ score: number; breakdown: Array<{ rule: string; points: number; reason: string }> }> {
  const db = await getDb();
  if (!db) return { score: 0, breakdown: [] };

  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId));
  if (!contact) return { score: 0, breakdown: [] };

  const rules = await db.select().from(leadScoringRules).where(eq(leadScoringRules.isActive, true)).orderBy(desc(leadScoringRules.priority));

  let totalScore = 0;
  const breakdown: Array<{ rule: string; points: number; reason: string }> = [];

  for (const rule of rules) {
    const value = JSON.parse(rule.value);
    let matches = false;

    // Get field value from contact
    const fieldValue = getContactFieldValue(contact, rule.field);

    switch (rule.operator) {
      case "equals":
        matches = fieldValue === value;
        break;
      case "not_equals":
        matches = fieldValue !== value;
        break;
      case "contains":
        matches = typeof fieldValue === "string" && fieldValue.toLowerCase().includes(String(value).toLowerCase());
        break;
      case "greater_than":
        matches = Number(fieldValue) > Number(value);
        break;
      case "less_than":
        matches = Number(fieldValue) < Number(value);
        break;
      case "in_list":
        matches = Array.isArray(value) && value.includes(fieldValue);
        break;
      case "exists":
        matches = fieldValue != null && fieldValue !== "";
        break;
      case "not_exists":
        matches = fieldValue == null || fieldValue === "";
        break;
    }

    if (matches) {
      totalScore += rule.scoreChange;
      breakdown.push({
        rule: rule.name,
        points: rule.scoreChange,
        reason: `${rule.field} ${rule.operator} ${JSON.stringify(value)}`,
      });
    }
  }

  // AI enrichment bonus: analyze contact quality
  if (contact.organization && contact.jobTitle && contact.email) {
    try {
      const aiResult = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a B2B lead scoring AI. Score the quality of this lead on a 0-20 point scale based on their profile. Return ONLY a JSON object: {\"score\": number, \"reason\": string}",
          },
          {
            role: "user",
            content: `Lead profile: Name: ${contact.firstName} ${contact.lastName}, Company: ${contact.organization}, Title: ${contact.jobTitle}, Industry: ${contact.department || "unknown"}`,
          },
        ],
        maxTokens: 150,
      });

      const content = typeof aiResult.choices[0]?.message?.content === "string"
        ? aiResult.choices[0].message.content
        : "";
      const parsed = JSON.parse(content);
      if (parsed.score) {
        totalScore += parsed.score;
        breakdown.push({
          rule: "AI Profile Analysis",
          points: parsed.score,
          reason: parsed.reason || "AI-assessed lead quality",
        });
      }
    } catch {
      // AI scoring is optional, continue without it
    }
  }

  // Clamp score to 0-100
  totalScore = Math.max(0, Math.min(100, totalScore));

  // Update contact's lead score
  await db.update(crmContacts).set({ leadScore: totalScore }).where(eq(crmContacts.id, contactId));

  return { score: totalScore, breakdown };
}

function getContactFieldValue(contact: any, field: string): any {
  const fieldMap: Record<string, any> = {
    industry: contact.department,
    companyName: contact.organization,
    jobTitle: contact.jobTitle,
    email: contact.email,
    phone: contact.phone,
    contactType: contact.contactType,
    source: contact.source,
    status: contact.status,
    totalInteractions: contact.totalInteractions,
    leadScore: contact.leadScore,
    pipelineStage: contact.pipelineStage,
    dealValue: contact.dealValue,
    hasEmail: !!contact.email,
    hasPhone: !!contact.phone,
    hasCompany: !!contact.organization,
    daysSinceLastContact: contact.lastContactedAt
      ? Math.floor((Date.now() - new Date(contact.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24))
      : 999,
  };
  return fieldMap[field] ?? contact[field];
}

// --- Sequence Execution Engine ---

export async function executeSequenceStep(enrollmentId: number): Promise<{ success: boolean; action?: string; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const [enrollment] = await db.select().from(salesSequenceEnrollments).where(eq(salesSequenceEnrollments.id, enrollmentId));
  if (!enrollment || enrollment.status !== "active") {
    return { success: false, error: "Enrollment not active" };
  }

  // Get current step
  const [step] = await db
    .select()
    .from(salesSequenceSteps)
    .where(
      and(
        eq(salesSequenceSteps.sequenceId, enrollment.sequenceId),
        eq(salesSequenceSteps.stepOrder, enrollment.currentStepOrder ?? 1),
      )
    );

  if (!step) {
    // No more steps — mark completed
    await db.update(salesSequenceEnrollments).set({
      status: "completed",
      completedAt: new Date(),
    }).where(eq(salesSequenceEnrollments.id, enrollmentId));

    await db.update(salesSequences).set({
      totalCompleted: sql`${salesSequences.totalCompleted} + 1`,
    }).where(eq(salesSequences.id, enrollment.sequenceId));

    return { success: true, action: "sequence_completed" };
  }

  // Get contact
  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, enrollment.contactId));
  if (!contact) return { success: false, error: "Contact not found" };

  let actionResult = "";

  switch (step.stepType) {
    case "email": {
      const emailResult = await sendSequenceEmail(step, contact, enrollment);
      actionResult = emailResult.success ? "email_sent" : `email_failed: ${emailResult.error}`;
      if (emailResult.success) {
        await db.update(salesSequenceSteps).set({
          totalSent: sql`${salesSequenceSteps.totalSent} + 1`,
        }).where(eq(salesSequenceSteps.id, step.id));
        await db.update(salesSequenceEnrollments).set({
          emailsSent: sql`${salesSequenceEnrollments.emailsSent} + 1`,
        }).where(eq(salesSequenceEnrollments.id, enrollmentId));
      }
      break;
    }
    case "phone_call": {
      // Create a sales task for the rep
      await db.insert(salesTasks).values({
        contactId: contact.id,
        dealId: enrollment.dealId,
        title: `Call ${contact.firstName} ${contact.lastName} - ${step.name}`,
        description: step.callScript || step.callObjective || "Outreach call as part of sales sequence",
        taskType: "call",
        priority: "high",
        dueAt: new Date(),
        source: "sequence_step",
        sourceSequenceId: enrollment.sequenceId,
        aiTalkingPoints: step.callScript,
      });
      actionResult = "call_task_created";
      break;
    }
    case "linkedin_connect":
    case "linkedin_message": {
      await db.insert(salesTasks).values({
        contactId: contact.id,
        dealId: enrollment.dealId,
        title: `LinkedIn: ${step.name} - ${contact.firstName} ${contact.lastName}`,
        description: step.bodyTemplate || "Connect/message on LinkedIn",
        taskType: "follow_up",
        priority: "medium",
        dueAt: new Date(),
        source: "sequence_step",
        sourceSequenceId: enrollment.sequenceId,
      });
      actionResult = "linkedin_task_created";
      break;
    }
    case "task": {
      await db.insert(salesTasks).values({
        contactId: contact.id,
        dealId: enrollment.dealId,
        title: step.name,
        description: step.bodyTemplate,
        taskType: "follow_up",
        priority: "medium",
        dueAt: new Date(),
        source: "sequence_step",
        sourceSequenceId: enrollment.sequenceId,
      });
      actionResult = "task_created";
      break;
    }
    case "wait": {
      actionResult = "waiting";
      break;
    }
    case "condition": {
      // Evaluate condition and branch
      const conditionMet = await evaluateCondition(step, contact, enrollment);
      const nextStepId = conditionMet ? step.trueBranchStepId : step.falseBranchStepId;
      if (nextStepId) {
        const [branchStep] = await db.select().from(salesSequenceSteps).where(eq(salesSequenceSteps.id, nextStepId));
        if (branchStep) {
          await db.update(salesSequenceEnrollments).set({
            currentStepId: branchStep.id,
            currentStepOrder: branchStep.stepOrder,
          }).where(eq(salesSequenceEnrollments.id, enrollmentId));
          return { success: true, action: `branched_to_step_${branchStep.stepOrder}` };
        }
      }
      actionResult = `condition_${conditionMet ? "true" : "false"}`;
      break;
    }
  }

  // Advance to next step
  const nextStepOrder = (enrollment.currentStepOrder ?? 1) + 1;
  const [nextStep] = await db
    .select()
    .from(salesSequenceSteps)
    .where(
      and(
        eq(salesSequenceSteps.sequenceId, enrollment.sequenceId),
        eq(salesSequenceSteps.stepOrder, nextStepOrder),
      )
    );

  const nextActionAt = nextStep
    ? new Date(Date.now() + ((nextStep.delayDays ?? 0) * 86400000) + ((nextStep.delayHours ?? 0) * 3600000))
    : null;

  await db.update(salesSequenceEnrollments).set({
    currentStepOrder: nextStepOrder,
    currentStepId: nextStep?.id ?? null,
    stepsCompleted: sql`${salesSequenceEnrollments.stepsCompleted} + 1`,
    nextActionAt,
  }).where(eq(salesSequenceEnrollments.id, enrollmentId));

  return { success: true, action: actionResult };
}

async function sendSequenceEmail(
  step: any,
  contact: any,
  enrollment: any,
): Promise<{ success: boolean; error?: string }> {
  let subject = step.subject || "Following up";
  let body = step.bodyTemplate || "";

  // AI personalization
  if (step.useAiPersonalization && step.aiPrompt) {
    try {
      const aiResult = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a B2B sales email writer. Write a professional, personalized email. Return ONLY a JSON object: {"subject": string, "body": string}. The body should be HTML formatted.`,
          },
          {
            role: "user",
            content: `Prompt: ${step.aiPrompt}\n\nContact: ${contact.firstName} ${contact.lastName}, ${contact.jobTitle || ""} at ${contact.organization || "their company"}\nEmail: ${contact.email}\nPrevious interactions: ${contact.totalInteractions || 0}\nSequence step: ${step.stepOrder} of sequence`,
          },
        ],
        maxTokens: 800,
      });

      const content = typeof aiResult.choices[0]?.message?.content === "string"
        ? aiResult.choices[0].message.content
        : "";
      const parsed = JSON.parse(content);
      if (parsed.subject) subject = parsed.subject;
      if (parsed.body) body = parsed.body;
    } catch {
      // Fall back to template
    }
  }

  // Replace placeholders in template
  body = replacePlaceholders(body, contact);
  subject = replacePlaceholders(subject, contact);

  if (!contact.email) {
    return { success: false, error: "Contact has no email address" };
  }

  try {
    await sendEmail({
      to: contact.email,
      subject,
      html: formatEmailHtml(body),
    });

    // Log interaction
    const db = await getDb();
    if (db) {
      await db.insert(crmInteractions).values({
        contactId: contact.id,
        channel: "email",
        interactionType: "sent",
        subject,
        content: body,
        summary: `Automated sequence email (step ${step.stepOrder})`,
      });

      await db.update(crmContacts).set({
        lastContactedAt: new Date(),
        totalInteractions: sql`${crmContacts.totalInteractions} + 1`,
      }).where(eq(crmContacts.id, contact.id));
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function replacePlaceholders(template: string, contact: any): string {
  return template
    .replace(/\{\{firstName\}\}/g, contact.firstName || "")
    .replace(/\{\{lastName\}\}/g, contact.lastName || "")
    .replace(/\{\{fullName\}\}/g, `${contact.firstName || ""} ${contact.lastName || ""}`.trim())
    .replace(/\{\{companyName\}\}/g, contact.organization || "your company")
    .replace(/\{\{jobTitle\}\}/g, contact.jobTitle || "")
    .replace(/\{\{email\}\}/g, contact.email || "");
}

async function evaluateCondition(step: any, contact: any, enrollment: any): Promise<boolean> {
  switch (step.conditionType) {
    case "email_opened":
      return (enrollment.emailsOpened ?? 0) > 0;
    case "email_replied":
      return (enrollment.emailsReplied ?? 0) > 0;
    case "meeting_booked":
      return enrollment.status === "meeting_booked";
    case "no_response":
      return (enrollment.emailsReplied ?? 0) === 0;
    case "lead_score_above":
      return (contact.leadScore ?? 0) >= Number(step.conditionValue || 0);
    default:
      return false;
  }
}

// --- Process Due Sequence Steps (called by scheduler) ---

export async function processDueSequenceSteps(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const db = await getDb();
  if (!db) return { processed: 0, succeeded: 0, failed: 0 };

  const now = new Date();
  const dueEnrollments = await db
    .select()
    .from(salesSequenceEnrollments)
    .where(
      and(
        eq(salesSequenceEnrollments.status, "active"),
        lte(salesSequenceEnrollments.nextActionAt, now),
      )
    )
    .limit(50);

  let succeeded = 0;
  let failed = 0;

  for (const enrollment of dueEnrollments) {
    const result = await executeSequenceStep(enrollment.id);
    if (result.success) succeeded++;
    else failed++;
  }

  return { processed: dueEnrollments.length, succeeded, failed };
}

// --- Pipeline Automation Engine ---

export async function executePipelineAutomation(
  event: string,
  data: { contactId?: number; dealId?: number; oldStage?: string; newStage?: string; [key: string]: any },
): Promise<{ rulesExecuted: number; actions: string[] }> {
  const db = await getDb();
  if (!db) return { rulesExecuted: 0, actions: [] };

  const rules = await db
    .select()
    .from(salesAutomationRules)
    .where(
      and(
        eq(salesAutomationRules.isActive, true),
        eq(salesAutomationRules.triggerEvent, event as any),
      )
    )
    .orderBy(desc(salesAutomationRules.priority));

  const actions: string[] = [];

  for (const rule of rules) {
    // Check trigger conditions
    const conditions = rule.triggerConditions ? JSON.parse(rule.triggerConditions) : {};
    if (!matchesConditions(conditions, data)) continue;

    const config = JSON.parse(rule.actionConfig);
    let actionStatus: "success" | "failed" | "skipped" = "success";
    let actionResult: any = {};
    let errorMessage: string | undefined;

    try {
      switch (rule.actionType) {
        case "change_deal_stage": {
          if (data.dealId) {
            await db.update(crmDeals).set({ stage: config.stage }).where(eq(crmDeals.id, data.dealId));
            actionResult = { dealId: data.dealId, newStage: config.stage };
            actions.push(`deal_stage_changed_to_${config.stage}`);
          }
          break;
        }
        case "update_lead_score": {
          if (data.contactId) {
            await db.update(crmContacts).set({
              leadScore: sql`${crmContacts.leadScore} + ${config.scoreChange || 0}`,
            }).where(eq(crmContacts.id, data.contactId));
            actions.push(`lead_score_updated_by_${config.scoreChange}`);
          }
          break;
        }
        case "enroll_in_sequence": {
          if (data.contactId && config.sequenceId) {
            await enrollContactInSequence(data.contactId, config.sequenceId, data.dealId);
            actions.push(`enrolled_in_sequence_${config.sequenceId}`);
          }
          break;
        }
        case "remove_from_sequence": {
          if (data.contactId && config.sequenceId) {
            await db.update(salesSequenceEnrollments).set({
              status: "removed",
              removedReason: "Automation rule triggered",
            }).where(
              and(
                eq(salesSequenceEnrollments.contactId, data.contactId),
                eq(salesSequenceEnrollments.sequenceId, config.sequenceId),
                eq(salesSequenceEnrollments.status, "active"),
              )
            );
            actions.push(`removed_from_sequence_${config.sequenceId}`);
          }
          break;
        }
        case "send_email": {
          if (data.contactId) {
            const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, data.contactId));
            if (contact?.email) {
              await sendEmail({
                to: contact.email,
                subject: config.subject || "Update from our team",
                html: formatEmailHtml(replacePlaceholders(config.body || "", contact)),
              });
              actions.push("email_sent");
            }
          }
          break;
        }
        case "create_task": {
          await db.insert(salesTasks).values({
            contactId: data.contactId,
            dealId: data.dealId,
            title: config.title || "Follow up",
            description: config.description,
            taskType: config.taskType || "follow_up",
            priority: config.priority || "medium",
            dueAt: config.dueDays ? new Date(Date.now() + config.dueDays * 86400000) : new Date(Date.now() + 86400000),
            source: "automation_rule",
            sourceRuleId: rule.id,
          });
          actions.push("task_created");
          break;
        }
        case "create_proposal": {
          if (data.contactId && data.dealId) {
            await generateProposal(data.dealId, data.contactId);
            actions.push("proposal_created");
          }
          break;
        }
        case "convert_to_customer": {
          if (data.contactId) {
            await convertLeadToCustomer(data.contactId);
            actions.push("converted_to_customer");
          }
          break;
        }
        case "create_sales_order": {
          if (data.dealId) {
            await createSalesOrderFromDeal(data.dealId);
            actions.push("sales_order_created");
          }
          break;
        }
        case "send_notification": {
          actions.push("notification_sent");
          break;
        }
        case "assign_owner": {
          if (data.contactId && config.userId) {
            await db.update(crmContacts).set({ assignedTo: config.userId }).where(eq(crmContacts.id, data.contactId));
            actions.push(`assigned_to_user_${config.userId}`);
          }
          break;
        }
        case "add_tag": {
          actions.push(`tag_added_${config.tagId}`);
          break;
        }
        case "remove_tag": {
          actions.push(`tag_removed_${config.tagId}`);
          break;
        }
        case "update_contact_field": {
          if (data.contactId && config.field && config.value !== undefined) {
            await db.update(crmContacts).set({ [config.field]: config.value }).where(eq(crmContacts.id, data.contactId));
            actions.push(`contact_field_${config.field}_updated`);
          }
          break;
        }
        default:
          actionStatus = "skipped";
      }
    } catch (err: any) {
      actionStatus = "failed";
      errorMessage = err.message;
    }

    // Log execution
    await db.insert(salesAutomationLog).values({
      ruleId: rule.id,
      contactId: data.contactId,
      dealId: data.dealId,
      triggerEvent: event,
      triggerData: JSON.stringify(data),
      actionType: rule.actionType,
      actionResult: JSON.stringify(actionResult),
      status: actionStatus,
      errorMessage,
    });

    await db.update(salesAutomationRules).set({
      executionCount: sql`${salesAutomationRules.executionCount} + 1`,
      lastExecutedAt: new Date(),
    }).where(eq(salesAutomationRules.id, rule.id));
  }

  return { rulesExecuted: rules.length, actions };
}

function matchesConditions(conditions: Record<string, any>, data: Record<string, any>): boolean {
  for (const [key, expected] of Object.entries(conditions)) {
    if (data[key] !== expected) return false;
  }
  return true;
}

// --- Enrollment ---

export async function enrollContactInSequence(
  contactId: number,
  sequenceId: number,
  dealId?: number | null,
  enrolledBy?: number,
): Promise<{ success: boolean; enrollmentId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Check not already enrolled
  const existing = await db
    .select()
    .from(salesSequenceEnrollments)
    .where(
      and(
        eq(salesSequenceEnrollments.contactId, contactId),
        eq(salesSequenceEnrollments.sequenceId, sequenceId),
        eq(salesSequenceEnrollments.status, "active"),
      )
    );

  if (existing.length > 0) {
    return { success: false, error: "Contact already enrolled in this sequence" };
  }

  // Get first step
  const [firstStep] = await db
    .select()
    .from(salesSequenceSteps)
    .where(eq(salesSequenceSteps.sequenceId, sequenceId))
    .orderBy(asc(salesSequenceSteps.stepOrder))
    .limit(1);

  const nextActionAt = firstStep
    ? new Date(Date.now() + ((firstStep.delayDays ?? 0) * 86400000) + ((firstStep.delayHours ?? 0) * 3600000))
    : new Date();

  const [result] = await db.insert(salesSequenceEnrollments).values({
    sequenceId,
    contactId,
    dealId: dealId ?? undefined,
    status: "active",
    currentStepId: firstStep?.id,
    currentStepOrder: 1,
    nextActionAt,
    enrolledBy: enrolledBy ?? undefined,
  }).$returningId();

  await db.update(salesSequences).set({
    totalEnrolled: sql`${salesSequences.totalEnrolled} + 1`,
  }).where(eq(salesSequences.id, sequenceId));

  return { success: true, enrollmentId: result.id };
}

// --- Proposal Generation ---

export async function generateProposal(
  dealId: number,
  contactId: number,
  productIds?: number[],
): Promise<{ success: boolean; proposalId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId));
  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId));

  if (!deal || !contact) return { success: false, error: "Deal or contact not found" };

  // Get products for the proposal
  let proposalProducts: any[] = [];
  if (productIds && productIds.length > 0) {
    proposalProducts = await db.select().from(products).where(inArray(products.id, productIds));
  } else {
    // Default: get top active products
    proposalProducts = await db.select().from(products).where(eq(products.status, "active")).limit(5);
  }

  // AI-generate proposal content
  let aiSummary = "";
  let aiPitch = "";
  try {
    const aiResult = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a B2B sales proposal writer. Generate a professional proposal summary and pitch. Return JSON: {"summary": string, "pitch": string, "competitiveAdvantages": string[]}`,
        },
        {
          role: "user",
          content: `Deal: ${deal.name}\nContact: ${contact.firstName} ${contact.lastName} at ${contact.organization || "their company"}\nDeal value: $${deal.amount || "TBD"}\nProducts: ${proposalProducts.map(p => p.name).join(", ")}`,
        },
      ],
      maxTokens: 600,
    });

    const content = typeof aiResult.choices[0]?.message?.content === "string"
      ? aiResult.choices[0].message.content
      : "";
    const parsed = JSON.parse(content);
    aiSummary = parsed.summary || "";
    aiPitch = parsed.pitch || "";
  } catch {
    aiSummary = `Proposal for ${deal.name}`;
    aiPitch = "";
  }

  // Calculate totals
  let subtotal = 0;
  const items = proposalProducts.map((p, i) => {
    const qty = 1;
    const unitPrice = Number(p.unitPrice) || 0;
    const total = qty * unitPrice;
    subtotal += total;
    return {
      productId: p.id,
      name: p.name,
      description: p.description || "",
      quantity: String(qty),
      unitPrice: String(unitPrice),
      discountPercent: "0",
      totalPrice: String(total),
      sortOrder: i,
    };
  });

  const proposalNumber = `PROP-${nanoid(8).toUpperCase()}`;
  const publicLinkId = nanoid(16);

  const [proposal] = await db.insert(salesProposals).values({
    proposalNumber,
    dealId,
    contactId,
    title: `Proposal: ${deal.name}`,
    summary: aiSummary,
    status: "draft",
    subtotal: String(subtotal),
    totalAmount: String(subtotal),
    currency: deal.currency || "USD",
    validUntil: new Date(Date.now() + 30 * 86400000), // 30 days
    aiGeneratedSummary: aiSummary,
    aiGeneratedPitch: aiPitch,
    publicLinkId,
  }).$returningId();

  // Insert line items
  for (const item of items) {
    await db.insert(salesProposalItems).values({
      proposalId: proposal.id,
      ...item,
    });
  }

  return { success: true, proposalId: proposal.id };
}

// --- Lead to Customer Conversion ---

export async function convertLeadToCustomer(contactId: number): Promise<{ success: boolean; customerId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId));
  if (!contact) return { success: false, error: "Contact not found" };

  // Check if already converted
  if (contact.customerId) {
    return { success: true, customerId: contact.customerId };
  }

  // Create customer record
  const [customer] = await db.insert(customers).values({
    name: contact.organization || `${contact.firstName} ${contact.lastName}`,
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    city: contact.city,
    state: contact.state,
    country: contact.country,
    postalCode: contact.postalCode,
    type: "business",
    status: "active",
    notes: `Converted from CRM contact #${contact.id}`,
  }).$returningId();

  // Link contact to customer
  await db.update(crmContacts).set({
    customerId: customer.id,
    contactType: "customer",
  }).where(eq(crmContacts.id, contactId));

  return { success: true, customerId: customer.id };
}

// --- Create Sales Order from Deal ---

export async function createSalesOrderFromDeal(dealId: number): Promise<{ success: boolean; salesOrderId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId));
  if (!deal) return { success: false, error: "Deal not found" };

  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, deal.contactId));

  // Get related proposal items if any
  const proposals = await db
    .select()
    .from(salesProposals)
    .where(
      and(
        eq(salesProposals.dealId, dealId),
        eq(salesProposals.status, "accepted"),
      )
    )
    .limit(1);

  const orderNumber = `SO-${nanoid(8).toUpperCase()}`;

  const [salesOrder] = await db.insert(salesOrders).values({
    orderNumber,
    source: "manual",
    customerId: contact?.customerId ?? undefined,
    status: "pending",
    totalAmount: deal.amount ? String(deal.amount) : "0",
    currency: deal.currency || "USD",
    notes: `Auto-created from deal: ${deal.name} (#${deal.id})`,
  }).$returningId();

  // If there's an accepted proposal, copy line items
  if (proposals.length > 0) {
    const proposalItems = await db
      .select()
      .from(salesProposalItems)
      .where(eq(salesProposalItems.proposalId, proposals[0].id));

    for (const item of proposalItems) {
      if (item.productId) {
        await db.insert(salesOrderLines).values({
          salesOrderId: salesOrder.id,
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        });
      }
    }
  }

  return { success: true, salesOrderId: salesOrder.id };
}

// --- Sales Forecasting ---

export async function generateSalesForecast(
  periodType: "week" | "month" | "quarter",
): Promise<{ success: boolean; forecastId?: number; forecast?: any; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;

  switch (periodType) {
    case "week":
      periodStart = new Date(now);
      periodEnd = new Date(now.getTime() + 7 * 86400000);
      break;
    case "month":
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case "quarter":
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      periodStart = new Date(now.getFullYear(), quarterStart, 1);
      periodEnd = new Date(now.getFullYear(), quarterStart + 3, 0);
      break;
  }

  // Get open deals
  const openDeals = await db
    .select()
    .from(crmDeals)
    .where(eq(crmDeals.status, "open"));

  let pipelineValue = 0;
  let weightedValue = 0;
  let bestCase = 0;
  let worstCase = 0;

  for (const deal of openDeals) {
    const amount = Number(deal.amount) || 0;
    const probability = (deal.probability || 0) / 100;
    pipelineValue += amount;
    weightedValue += amount * probability;
    bestCase += amount * Math.min(1, probability + 0.2);
    worstCase += amount * Math.max(0, probability - 0.2);
  }

  const avgDealSize = openDeals.length > 0 ? pipelineValue / openDeals.length : 0;

  // Get won deals for win rate calculation
  const wonDeals = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(crmDeals)
    .where(eq(crmDeals.status, "won"));

  const lostDeals = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(crmDeals)
    .where(eq(crmDeals.status, "lost"));

  const totalClosed = (wonDeals[0]?.count || 0) + (lostDeals[0]?.count || 0);
  const winRate = totalClosed > 0 ? ((wonDeals[0]?.count || 0) / totalClosed) * 100 : 0;

  // AI forecast
  let aiInsights = "";
  let aiForecastValue = weightedValue;
  try {
    const aiResult = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a sales forecasting AI. Analyze the pipeline data and provide insights. Return JSON: {\"forecastValue\": number, \"insights\": string[], \"riskFactors\": string[]}",
        },
        {
          role: "user",
          content: `Pipeline: ${openDeals.length} open deals, total value: $${pipelineValue.toFixed(2)}, weighted: $${weightedValue.toFixed(2)}, win rate: ${winRate.toFixed(1)}%, avg deal: $${avgDealSize.toFixed(2)}, period: ${periodType}`,
        },
      ],
      maxTokens: 400,
    });

    const content = typeof aiResult.choices[0]?.message?.content === "string"
      ? aiResult.choices[0].message.content
      : "";
    const parsed = JSON.parse(content);
    aiForecastValue = parsed.forecastValue || weightedValue;
    aiInsights = JSON.stringify(parsed.insights || []);
  } catch {
    aiInsights = JSON.stringify(["Forecast based on weighted pipeline value"]);
  }

  const [forecast] = await db.insert(salesForecasts).values({
    periodStart: periodStart!,
    periodEnd: periodEnd!,
    periodType,
    pipelineValue: String(pipelineValue),
    weightedValue: String(weightedValue),
    bestCaseValue: String(bestCase),
    worstCaseValue: String(worstCase),
    aiForecastValue: String(aiForecastValue),
    dealCount: openDeals.length,
    avgDealSize: String(avgDealSize),
    winRate: String(winRate),
    aiInsights,
  }).$returningId();

  return {
    success: true,
    forecastId: forecast.id,
    forecast: {
      pipelineValue,
      weightedValue,
      bestCase,
      worstCase,
      aiForecastValue,
      dealCount: openDeals.length,
      avgDealSize,
      winRate,
    },
  };
}

// --- Bulk Score All Leads ---

export async function scoreAllLeads(): Promise<{ scored: number; avgScore: number }> {
  const db = await getDb();
  if (!db) return { scored: 0, avgScore: 0 };

  const contacts = await db
    .select({ id: crmContacts.id })
    .from(crmContacts)
    .where(
      or(
        eq(crmContacts.contactType, "lead"),
        eq(crmContacts.contactType, "prospect"),
      )
    );

  let totalScore = 0;
  for (const contact of contacts) {
    const result = await calculateLeadScore(contact.id);
    totalScore += result.score;
  }

  return {
    scored: contacts.length,
    avgScore: contacts.length > 0 ? totalScore / contacts.length : 0,
  };
}

// --- Get Pipeline Summary ---

export async function getPipelineSummary(): Promise<any> {
  const db = await getDb();
  if (!db) return null;

  const stages = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];

  const stageData = await Promise.all(
    stages.map(async (stage) => {
      const deals = await db
        .select({
          count: sql<number>`COUNT(*)`,
          totalValue: sql<string>`COALESCE(SUM(CAST(${crmDeals.amount} AS DECIMAL(15,2))), 0)`,
          avgProbability: sql<number>`COALESCE(AVG(${crmDeals.probability}), 0)`,
        })
        .from(crmDeals)
        .where(and(eq(crmDeals.stage, stage), eq(crmDeals.status, "open")));

      return {
        stage,
        dealCount: deals[0]?.count || 0,
        totalValue: Number(deals[0]?.totalValue || 0),
        avgProbability: Math.round(deals[0]?.avgProbability || 0),
      };
    })
  );

  const totalPipeline = stageData.reduce((sum, s) => sum + s.totalValue, 0);
  const totalDeals = stageData.reduce((sum, s) => sum + s.dealCount, 0);

  return { stages: stageData, totalPipeline, totalDeals };
}

// --- Get Automation Stats ---

export async function getAutomationStats(): Promise<any> {
  const db = await getDb();
  if (!db) return null;

  const [sequenceStats] = await db
    .select({
      totalSequences: sql<number>`COUNT(*)`,
      activeSequences: sql<number>`SUM(CASE WHEN ${salesSequences.status} = 'active' THEN 1 ELSE 0 END)`,
      totalEnrolled: sql<number>`COALESCE(SUM(${salesSequences.totalEnrolled}), 0)`,
      totalConverted: sql<number>`COALESCE(SUM(${salesSequences.totalConverted}), 0)`,
    })
    .from(salesSequences);

  const [automationStats] = await db
    .select({
      totalRules: sql<number>`COUNT(*)`,
      activeRules: sql<number>`SUM(CASE WHEN ${salesAutomationRules.isActive} = true THEN 1 ELSE 0 END)`,
      totalExecutions: sql<number>`COALESCE(SUM(${salesAutomationRules.executionCount}), 0)`,
    })
    .from(salesAutomationRules);

  const [taskStats] = await db
    .select({
      totalTasks: sql<number>`COUNT(*)`,
      pendingTasks: sql<number>`SUM(CASE WHEN ${salesTasks.status} = 'pending' THEN 1 ELSE 0 END)`,
      completedTasks: sql<number>`SUM(CASE WHEN ${salesTasks.status} = 'completed' THEN 1 ELSE 0 END)`,
      overdueTasks: sql<number>`SUM(CASE WHEN ${salesTasks.status} = 'overdue' THEN 1 ELSE 0 END)`,
    })
    .from(salesTasks);

  const [proposalStats] = await db
    .select({
      totalProposals: sql<number>`COUNT(*)`,
      sentProposals: sql<number>`SUM(CASE WHEN ${salesProposals.status} = 'sent' THEN 1 ELSE 0 END)`,
      acceptedProposals: sql<number>`SUM(CASE WHEN ${salesProposals.status} = 'accepted' THEN 1 ELSE 0 END)`,
    })
    .from(salesProposals);

  return {
    sequences: sequenceStats,
    automation: automationStats,
    tasks: taskStats,
    proposals: proposalStats,
  };
}
