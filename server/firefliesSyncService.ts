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
import { extractMeetingActionItems } from "./meetingTaskExtractor";

export interface FirefliesSyncResult {
  totalSynced: number;
  totalSkipped: number;
  contactsCreated: number;
  dealsCreated: number;
  notificationsCreated: number;
  tasksSuggested: number;
  errors: string[];
}

/**
 * Convert Fireflies action items to project_tasks via the importance-scored
 * meeting extractor. Returns the number of tasks actually created (skipped /
 * deduped / rejected items aren't counted).
 *
 * Replaces the previous queueFirefliesActionItemsForApproval which:
 *   - was hard-limited to fundraising/sales/legal domains
 *   - routed everything through aiAgentTasks (approval queue)
 *   - had a fixed 75% confidence with no actual scoring
 */
export async function extractFirefliesActionItems(params: {
  meetingId: number;
  meetingTitle: string;
  firefliesId: string;
  meetingDate?: Date;
  actionItems: FirefliesActionItem[];
  participants: Array<{ name?: string; email?: string }>;
}): Promise<number> {
  const outcomes = await extractMeetingActionItems(params.actionItems, {
    meetingId: params.meetingId,
    firefliesId: params.firefliesId,
    title: params.meetingTitle,
    date: params.meetingDate,
    participants: params.participants,
  });
  return outcomes.filter(o => o.kind === "created").length;
}

/**
 * Backward-compatible shim for callers in routers.ts. New code should use
 * extractFirefliesActionItems directly.
 */
export async function queueFirefliesActionItemsForApproval(params: {
  userId: number;
  meetingId?: number;
  meetingTitle: string;
  firefliesId?: string;
  actionItems: FirefliesActionItem[];
  participants: Array<{ name: string; email: string }>;
  preferredProjectId?: number;
  preferredAssigneeId?: number;
}): Promise<number> {
  if (!params.meetingId) return 0;
  return extractFirefliesActionItems({
    meetingId: params.meetingId,
    meetingTitle: params.meetingTitle,
    firefliesId: params.firefliesId ?? `meeting-${params.meetingId}`,
    actionItems: params.actionItems,
    participants: params.participants,
  });
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
        const createdMeeting = await db.createFirefliesMeeting({
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
        const newMeetingDbId = Number(createdMeeting.id);
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
                const { id: contactFoundId, created } = await db.findOrCreateCrmContact({
                  firstName:
                    (participant.name || participant.email.split("@")[0])
                      .split(" ")[0] || "",
                  fullName:
                    participant.name || participant.email.split("@")[0],
                  email: participant.email,
                  source: "fireflies" as any,
                });
                if (created) result.contactsCreated++;
                const contact = await db.getCrmContactById(contactFoundId);

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

        const suggested = await extractFirefliesActionItems({
          meetingId: newMeetingDbId,
          meetingTitle: fullTranscript?.title || t.title || "Unknown meeting",
          firefliesId: t.id,
          meetingDate: t.date ? new Date(t.date) : undefined,
          actionItems: parseActionItems(actionItems),
          participants,
        });
        result.tasksSuggested += suggested;
        if (suggested > 0) {
          await db.updateFirefliesMeeting(newMeetingDbId, {
            processingStatus: "tasks_created",
            processedAt: new Date(),
            autoCreatedTaskCount: suggested,
          });
        }
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
