/**
 * Fireflies Sync Service
 *
 * Reusable service for auto-syncing Fireflies meetings into the CRM.
 * Used by both the background job (server/_core/index.ts) and
 * the manual sync endpoint (routers.ts).
 *
 * For each new meeting:
 * - Saves transcript
 * - Extracts participants and matches/creates CRM contacts
 * - Detects deal signals in transcript and creates/updates CRM deals
 * - Extracts action items and creates notifications
 */

import {
  listTranscripts,
  getTranscript,
  extractParticipants,
  parseActionItems,
  type FirefliesActionItem,
} from "./_core/fireflies";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";

export interface FirefliesSyncResult {
  totalSynced: number;
  totalSkipped: number;
  contactsCreated: number;
  dealsCreated: number;
  notificationsCreated: number;
  tasksSuggested: number;
  errors: string[];
}

const ALLOWED_TASK_DOMAINS = new Set(["fundraising", "sales", "legal"]);

function classifyTaskDomain(text: string): "fundraising" | "sales" | "legal" | null {
  const t = text.toLowerCase();
  if (/\b(fundrais|investor|pitch|seed|series a|series b|term sheet|cap table|runway|valuation)\b/.test(t)) return "fundraising";
  if (/\b(sales|lead|prospect|demo|pipeline|quote|proposal|renewal|close|customer)\b/.test(t)) return "sales";
  if (/\b(legal|contract|nda|msa|dpa|compliance|policy|terms|counsel|regulatory)\b/.test(t)) return "legal";
  return null;
}

async function routeTaskProjectAndAssignee(params: {
  taskText: string;
  domain: "fundraising" | "sales" | "legal";
  meetingTitle: string;
  participants: Array<{ name: string; email: string }>;
  preferredProjectId?: number;
  preferredAssigneeHint?: string;
}) {
  const projects = await db.getProjects();
  const teamMembers = await db.getTeamMembers();
  const projectIndex = new Map((projects || []).map((p: any) => [p.id, p]));
  const userIndex = new Map((teamMembers || []).map((u: any) => [u.id, u]));

  if (params.preferredProjectId && projectIndex.has(params.preferredProjectId)) {
    const assigneeId = (teamMembers || []).find((u: any) => {
      const hint = (params.preferredAssigneeHint || "").toLowerCase();
      if (!hint) return false;
      return (u.name || "").toLowerCase().includes(hint) || (u.email || "").toLowerCase().includes(hint);
    })?.id ?? null;
    return { projectId: params.preferredProjectId, assigneeId };
  }

  const domainProject = (projects || []).find((p: any) =>
    `${p.name || ""} ${p.description || ""}`.toLowerCase().includes(params.domain)
  );
  if (domainProject) return { projectId: domainProject.id, assigneeId: null as number | null };

  if (!projects?.length) return { projectId: null as number | null, assigneeId: null as number | null };

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Route this action item to a project and optional assignee. Return JSON only: {\"projectId\":number|null,\"assigneeId\":number|null}." },
        {
          role: "user",
          content: JSON.stringify({
            taskText: params.taskText,
            domain: params.domain,
            meetingTitle: params.meetingTitle,
            participants: params.participants,
            assigneeHint: params.preferredAssigneeHint || null,
            projects: (projects || []).map((p: any) => ({ id: p.id, name: p.name, description: p.description })),
            assignees: (teamMembers || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email })),
          }),
        },
      ],
    });
    const text = typeof response.choices?.[0]?.message?.content === "string" ? response.choices[0].message.content : "";
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim() || "{}");
    const projectId = typeof parsed.projectId === "number" && projectIndex.has(parsed.projectId) ? parsed.projectId : null;
    const assigneeId = typeof parsed.assigneeId === "number" && userIndex.has(parsed.assigneeId) ? parsed.assigneeId : null;
    return { projectId, assigneeId };
  } catch {
    return { projectId: null as number | null, assigneeId: null as number | null };
  }
}

export async function queueFirefliesActionItemsForApproval(params: {
  userId: number;
  meetingId?: number;
  meetingTitle: string;
  firefliesId?: string;
  actionItems: FirefliesActionItem[];
  participants: Array<{ name: string; email: string }>;
  preferredProjectId?: number;
}): Promise<number> {
  let created = 0;
  for (const item of params.actionItems) {
    const taskText = item.text?.trim();
    if (!taskText) continue;
    const domain = classifyTaskDomain(taskText);
    if (!domain || !ALLOWED_TASK_DOMAINS.has(domain)) continue;

    const routing = await routeTaskProjectAndAssignee({
      taskText,
      domain,
      meetingTitle: params.meetingTitle,
      participants: params.participants,
      preferredProjectId: params.preferredProjectId,
      preferredAssigneeHint: item.assignee,
    });
    if (!routing.projectId) continue;

    const taskPayload = {
      action: "create_project_task",
      projectId: routing.projectId,
      name: taskText,
      description: `From Fireflies meeting: ${params.meetingTitle}`,
      assigneeId: routing.assigneeId,
      dueDate: item.dueDate || null,
      priority: "medium",
      source: "fireflies",
      sourceMeeting: {
        firefliesId: params.firefliesId || null,
        meetingId: params.meetingId || null,
        title: params.meetingTitle,
      },
      domain,
    };

    const suggested = await db.createAiAgentTask({
      taskType: "query" as any,
      priority: "medium",
      status: "pending_approval",
      taskData: JSON.stringify(taskPayload),
      aiReasoning: `Suggested ${domain} task extracted from Fireflies action item`,
      aiConfidence: "75.00",
      relatedEntityType: "project",
      relatedEntityId: routing.projectId,
      requiresApproval: true,
    } as any);

    await db.createAiAgentLog({
      taskId: suggested.id,
      action: "fireflies_task_suggested",
      status: "info",
      message: `Fireflies task queued for approval: ${taskText.substring(0, 120)}`,
      details: JSON.stringify(taskPayload),
    } as any);
    created++;
  }
  return created;
}

/**
 * Sync meetings for a single user with a Fireflies config.
 */
export async function syncFirefliesMeetingsForUser(
  userId: number,
  apiKey: string
): Promise<FirefliesSyncResult> {
  const result: FirefliesSyncResult = {
    totalSynced: 0,
    totalSkipped: 0,
    contactsCreated: 0,
    dealsCreated: 0,
    notificationsCreated: 0,
    tasksSuggested: 0,
    errors: [],
  };

  try {
    const transcripts = await listTranscripts(apiKey);

    for (const t of transcripts) {
      try {
        const existing = await db.getFirefliesMeetingByFirefliesId(t.id);
        if (existing) {
          result.totalSkipped++;
          continue;
        }

        const fullTranscript = await getTranscript(apiKey, t.id);
        const participants = fullTranscript
          ? extractParticipants(fullTranscript)
          : [];

        // Save meeting to database
        await db.createFirefliesMeeting({
          firefliesId: t.id,
          title: t.title,
          date: t.date ? new Date(t.date) : new Date(),
          duration: t.duration,
          participants: JSON.stringify(participants),
          transcriptUrl: fullTranscript?.transcript_url || null,
          summary: fullTranscript?.summary
            ? JSON.stringify(fullTranscript.summary)
            : null,
          actionItems: fullTranscript
            ? JSON.stringify(
                parseActionItems(fullTranscript?.summary?.action_items || [])
              )
            : null,
        });
        result.totalSynced++;

        // Auto-create CRM deals from meeting notes
        const overview = fullTranscript?.summary?.overview || "";
        const actionItems = fullTranscript?.summary?.action_items || [];

        const dealKeywords =
          /\b(proposal|contract|pricing|quote|deal|budget|agreement|renewal|upsell)\b/i;
        const hasDealSignals =
          dealKeywords.test(overview) ||
          actionItems.some((a: string) => dealKeywords.test(a));

        if (hasDealSignals && participants.length > 0) {
          // Find or create a default sales pipeline
          const pipelines = await db.getCrmPipelines("sales");
          let pipelineId = pipelines[0]?.id;
          if (!pipelineId) {
            pipelineId = await db.createCrmPipeline({
              name: "Sales Pipeline",
              type: "sales",
              stages: JSON.stringify([
                "discovery",
                "qualification",
                "proposal",
                "negotiation",
                "closed_won",
                "closed_lost",
              ]),
              isDefault: true,
              isActive: true,
            });
          }

          for (const participant of participants) {
            if (participant.email) {
              try {
                let contact = await db.getCrmContactByEmail(participant.email);
                if (!contact) {
                  const contactId = await db.createCrmContact({
                    firstName:
                      (participant.name || participant.email.split("@")[0])
                        .split(" ")[0] || "",
                    fullName:
                      participant.name || participant.email.split("@")[0],
                    email: participant.email,
                    source: "fireflies" as any,
                  });
                  contact = await db.getCrmContactById(contactId);
                  result.contactsCreated++;
                }

                if (contact) {
                  await db.createCrmDeal({
                    pipelineId,
                    contactId: contact.id,
                    name: `Deal from: ${fullTranscript?.title || t.title || "Meeting"}`,
                    stage: "discovery",
                    source: "meeting",
                    notes: `Auto-created from Fireflies meeting. Key topics: ${overview.substring(0, 200)}`,
                  });
                  result.dealsCreated++;

                  // Log meeting as CRM interaction
                  await db.createCrmInteraction({
                    contactId: contact.id,
                    channel: "meeting",
                    interactionType: "meeting_completed",
                    subject: fullTranscript?.title || t.title || "Meeting",
                    content: overview.substring(0, 500) || undefined,
                  });
                }
              } catch {
                /* skip duplicate contacts or failed deal creation */
              }
            }
          }
        }

        const suggested = await queueFirefliesActionItemsForApproval({
          userId,
          meetingTitle: fullTranscript?.title || t.title || "Unknown meeting",
          firefliesId: t.id,
          actionItems: parseActionItems(actionItems),
          participants,
        });
        result.tasksSuggested += suggested;
      } catch (meetingErr) {
        result.errors.push(
          `Failed to sync meeting ${t.id}: ${meetingErr instanceof Error ? meetingErr.message : String(meetingErr)}`
        );
      }
    }
  } catch (err) {
    result.errors.push(
      `Failed to list transcripts: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return result;
}

/**
 * Sync meetings for ALL users who have Fireflies configured.
 * Used by the background job scheduler.
 */
export async function syncAllFirefliesMeetings(): Promise<FirefliesSyncResult> {
  const aggregate: FirefliesSyncResult = {
    totalSynced: 0,
    totalSkipped: 0,
    contactsCreated: 0,
    dealsCreated: 0,
    notificationsCreated: 0,
    tasksSuggested: 0,
    errors: [],
  };

  try {
    const configs = await db.getAllFirefliesConfigs();
    if (!configs || configs.length === 0) return aggregate;

    for (const config of configs) {
      try {
        const result = await syncFirefliesMeetingsForUser(
          config.userId,
          config.apiKey
        );
        aggregate.totalSynced += result.totalSynced;
        aggregate.totalSkipped += result.totalSkipped;
        aggregate.contactsCreated += result.contactsCreated;
        aggregate.dealsCreated += result.dealsCreated;
        aggregate.notificationsCreated += result.notificationsCreated;
        aggregate.tasksSuggested += result.tasksSuggested;
        aggregate.errors.push(...result.errors);
      } catch (userErr) {
        aggregate.errors.push(
          `Failed for user ${config.userId}: ${userErr instanceof Error ? userErr.message : String(userErr)}`
        );
      }
    }
  } catch (err) {
    aggregate.errors.push(
      `Failed to get configs: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return aggregate;
}
