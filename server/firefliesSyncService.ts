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
  // CRM deals queued in the approval queue (not yet inserted as deals).
  dealApprovalsQueued: number;
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
  forceCreate?: boolean;
  routeToApproval?: boolean;
  preferredProjectId?: number;
  preferredAssigneeId?: number;
  stableIndices?: number[];
}): Promise<{ created: number; rejected: number; skipped: number }> {
  const outcomes = await extractMeetingActionItems(
    params.actionItems,
    {
      meetingId: params.meetingId,
      firefliesId: params.firefliesId,
      title: params.meetingTitle,
      date: params.meetingDate,
      participants: params.participants,
    },
    {
      forceCreate: params.forceCreate,
      routeToApproval: params.routeToApproval,
      preferredProjectId: params.preferredProjectId,
      preferredAssigneeId: params.preferredAssigneeId,
      stableIndices: params.stableIndices,
    },
  );
  return {
    created: outcomes.filter(o => o.kind === "created").length,
    rejected: outcomes.filter(o => o.kind === "rejected").length,
    skipped: outcomes.filter(o => o.kind === "skipped").length,
  };
}

/**
 * Backward-compatible shim for callers in routers.ts. Returns the count of
 * tasks that were actually created. Set `forceCreate` when the user
 * explicitly invokes Process Meeting from the UI to bypass importance
 * gates.
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
  forceCreate?: boolean;
  routeToApproval?: boolean;
  stableIndices?: number[];
}): Promise<number> {
  if (!params.meetingId) return 0;
  const result = await extractFirefliesActionItems({
    meetingId: params.meetingId,
    meetingTitle: params.meetingTitle,
    firefliesId: params.firefliesId ?? `meeting-${params.meetingId}`,
    actionItems: params.actionItems,
    participants: params.participants,
    forceCreate: params.forceCreate,
    routeToApproval: params.routeToApproval,
    preferredProjectId: params.preferredProjectId,
    preferredAssigneeId: params.preferredAssigneeId,
    stableIndices: params.stableIndices,
  });
  return result.created;
}

/**
 * Sync meetings for a single user with a Fireflies config.
 */
export async function syncFirefliesMeetingsForUser(
  userId: number,
  apiKey: string,
  opts: { autoCreateTasks?: boolean | null } = {}
): Promise<FirefliesSyncResult> {
  // When "Auto-create tasks" is explicitly off, meeting action items are
  // surfaced as approval-queue suggestions the user must approve before they
  // become real tasks. When on (or unset — the UI defaults on), they are
  // created directly (still importance-gated). This is the toggle at
  // Settings → Fireflies.
  const routeToApproval = opts.autoCreateTasks === false;
  const result: FirefliesSyncResult = {
    totalSynced: 0,
    totalSkipped: 0,
    contactsCreated: 0,
    dealApprovalsQueued: 0,
    notificationsCreated: 0,
    tasksSuggested: 0,
    errors: [],
  };

  try {
    const transcripts = await listTranscripts(apiKey);

    // Fetch internal emails once before the loop to avoid repeated DB queries
    const internalEmails = await db.getInternalEmailSet();

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
            if (participant.email && !internalEmails.has(participant.email.toLowerCase())) {
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
                  if (created) {
                    // Auto-deals from meetings flow through the approval queue.
                    // Title = contact's company; skip if missing or duplicate company.
                    const company = (contact.organization || "").trim();
                    const dupe = company
                      ? (await db.findCrmDealByCompany(company)) || (await db.hasPendingDealApprovalForCompany(company))
                      : true;
                    if (company && !dupe) {
                      const taskData = {
                        pipelineId,
                        contactId: contact.id,
                        company,
                        stage: "discovery",
                        source: "meeting",
                        notes: `Auto-created from Fireflies meeting. Key topics: ${overview.substring(0, 200)}`,
                      };
                      await db.createAiAgentTask({
                        taskType: 'create_crm_deal',
                        priority: 'medium',
                        status: 'pending_approval',
                        taskData: JSON.stringify(taskData),
                        aiReasoning: `Deal signals in Fireflies meeting "${fullTranscript?.title || t.title || 'Meeting'}" with ${contact.fullName} at ${company}.`,
                        aiConfidence: '80.00',
                      });
                      result.dealApprovalsQueued++;
                    }
                  }

                  // Always log meeting as CRM interaction regardless of whether
                  // the contact already existed.
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

        const extractResult = await extractFirefliesActionItems({
          meetingId: newMeetingDbId,
          meetingTitle: fullTranscript?.title || t.title || "Unknown meeting",
          firefliesId: t.id,
          meetingDate: t.date ? new Date(t.date) : undefined,
          actionItems: parseActionItems(actionItems),
          participants,
          routeToApproval,
        });
        const suggested = extractResult.created;
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
    dealApprovalsQueued: 0,
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
          config.apiKey,
          { autoCreateTasks: config.autoCreateTasks }
        );
        aggregate.totalSynced += result.totalSynced;
        aggregate.totalSkipped += result.totalSkipped;
        aggregate.contactsCreated += result.contactsCreated;
        aggregate.dealApprovalsQueued += result.dealApprovalsQueued;
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
