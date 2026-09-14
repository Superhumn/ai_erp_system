// appRouter.fireflies — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { listAllTranscripts, getTranscript, extractParticipants, parseActionItems, validateApiKey as validateFirefliesApiKey } from "../_core/fireflies";
import { queueFirefliesActionItemsForApproval } from "../firefliesSyncService";

// ============================================
// FIREFLIES INTEGRATION
// ============================================
export const firefliesRouter = router({
    getConfig: protectedProcedure.query(async ({ ctx }) => {
      const config = await db.getFirefliesConfig(ctx.user.id);
      if (!config) return null;
      return {
        isConnected: true,
        configured: true,
        autoCreateContacts: config.autoCreateContacts,
        autoCreateTasks: config.autoCreateTasks,
        autoCreateProjects: config.autoCreateProjects,
        lastSyncAt: (config as any).lastSyncAt,
        config: { apiKey: '***' },
      };
    }),
    configure: protectedProcedure
      .input(z.object({
        apiKey: z.string().min(1).optional(),
        autoCreateContacts: z.boolean().optional(),
        autoCreateTasks: z.boolean().optional(),
        autoCreateProjects: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const existingConfig = await db.getFirefliesConfig(ctx.user.id);
        const apiKeyToStore = input.apiKey?.trim() || existingConfig?.apiKey;
        if (!apiKeyToStore) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Please provide a Fireflies API key' });
        }

        // Validate only when a new API key is provided
        if (input.apiKey) {
          const validation = await validateFirefliesApiKey(input.apiKey);
          if (!validation.valid) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: validation.error || 'Invalid Fireflies API key' });
          }
        }
        console.log(`[Fireflies] API key validated for user ${ctx.user.id}, saving config...`);
        return db.upsertFirefliesConfig(ctx.user.id, {
          apiKey: apiKeyToStore,
          autoCreateContacts: input.autoCreateContacts,
          autoCreateTasks: input.autoCreateTasks,
          autoCreateProjects: input.autoCreateProjects,
        });
      }),
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      await db.deleteFirefliesConfig(ctx.user.id);
      return { success: true };
    }),
    syncMeetings: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(500).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
      const config = await db.getFirefliesConfig(ctx.user.id);
      if (!config) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Fireflies not configured. Go to Settings → Fireflies to enter your API key.' });
      }
      console.log(`[Fireflies Sync] Fetching transcripts for user ${ctx.user.id} with key ${config.apiKey.substring(0, 8)}...`);

      // Two-pass sync to work around Fireflies' broken `skip` pagination:
      //   1. Catch up on anything new since our newest stored meeting.
      //   2. Walk backwards from our oldest stored meeting to pull more history.
      // Each pass is bounded so a single click stays responsive — repeat
      // clicks keep extending coverage until exhausted.
      const existing = await db.getFirefliesMeetings();
      const dates = existing
        .map((m: any) => (m?.date ? new Date(m.date).getTime() : 0))
        .filter((n: number) => n > 0);
      const newestStoredMs = dates.length ? Math.max(...dates) : undefined;
      const oldestStoredMs = dates.length ? Math.min(...dates) : undefined;
      const perClickCap = input?.limit ?? 100;

      const fresh = await listAllTranscripts(config.apiKey, {
        maxItems: perClickCap,
        untilDateMs: newestStoredMs,
      });
      const backfill = oldestStoredMs
        ? await listAllTranscripts(config.apiKey, {
            maxItems: perClickCap,
            startToDateMs: oldestStoredMs - 1,
          })
        : [];

      // Dedup by id in case the two passes overlap.
      const byId = new Map<string, typeof fresh[number]>();
      for (const t of [...fresh, ...backfill]) if (t?.id) byId.set(t.id, t);
      const transcripts = Array.from(byId.values());
      console.log(`[Fireflies Sync] Got ${fresh.length} new + ${backfill.length} backfill = ${transcripts.length} unique transcripts`);
      let synced = 0;
      let skipped = 0;
      let dealApprovalsQueued = 0;
      let contactsCreated = 0;
      let tasksSuggested = 0;

      // Fetch internal emails once so we never create CRM contacts for team members
      const internalEmails = await db.getInternalEmailSet();

      for (const t of transcripts) {
        const existing = await db.getFirefliesMeetingByFirefliesId(t.id);
        if (existing) {
          skipped++;
          continue;
        }
        const fullTranscript = await getTranscript(config.apiKey, t.id);
        const participants = fullTranscript ? extractParticipants(fullTranscript) : [];
        const sentences = Array.isArray(fullTranscript?.sentences)
          ? fullTranscript!.sentences!
              .map((s) => ({ speaker: s.speaker_name || "Unknown", text: (s.text || "").trim() }))
              .filter((s) => s.text)
          : [];
        const createdMeeting = await db.createFirefliesMeeting({
          firefliesId: t.id,
          title: t.title || 'Untitled Meeting',
          date: t.date ? new Date(t.date) : new Date(),
          duration: t.duration,
          organizerEmail: fullTranscript?.organizer_email || t.organizer_email || null,
          participants: JSON.stringify(participants),
          transcriptUrl: fullTranscript?.transcript_url || null,
          recordingUrl: fullTranscript?.audio_url || null,
          transcriptText: sentences.length > 0 ? JSON.stringify(sentences) : null,
          summary: fullTranscript?.summary ? JSON.stringify(fullTranscript.summary) : null,
          actionItems: fullTranscript ? JSON.stringify(parseActionItems(fullTranscript?.summary?.action_items || [])) : null,
          processingStatus: 'pending',
        });
        const newMeetingDbId = Number(createdMeeting.id);
        synced++;

        // Auto-create CRM deals from meeting notes
        try {
          const overview = fullTranscript?.summary?.overview || "";
          const actionItems = fullTranscript?.summary?.action_items || [];

          // Check if meeting mentions deal-related keywords
          const dealKeywords = /\b(proposal|contract|pricing|quote|deal|budget|agreement|renewal|upsell)\b/i;
          const hasDealSignals = dealKeywords.test(overview) || actionItems.some((a: string) => dealKeywords.test(a));

          if (hasDealSignals && participants.length > 0) {
            // Find or create a default sales pipeline for auto-created deals
            const pipelines = await db.getCrmPipelines("sales");
            let pipelineId = pipelines[0]?.id;
            if (!pipelineId) {
              pipelineId = await db.createCrmPipeline({
                name: "Sales Pipeline",
                type: "sales",
                stages: JSON.stringify(["discovery", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"]),
                isDefault: true,
                isActive: true,
              });
            }

            for (const participant of participants) {
              if (participant.email && !internalEmails.has(participant.email.toLowerCase())) {
                try {
                  const { id: contactFoundId, created } = await db.findOrCreateCrmContact({
                    firstName: (participant.name || participant.email.split("@")[0]).split(" ")[0] || "",
                    fullName: participant.name || participant.email.split("@")[0],
                    email: participant.email,
                    source: "fireflies" as any,
                  });
                  if (created) contactsCreated++;
                  const contact = await db.getCrmContactById(contactFoundId);

                  if (contact) {
                    if (created) {
                      // Auto-deals from meetings also flow through the approval queue.
                      // Deal title must be the contact's company; skip if missing or duplicate.
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
                          aiReasoning: `Deal signals detected in Fireflies meeting "${fullTranscript?.title || t.title || 'Meeting'}" with ${contact.fullName} at ${company}.`,
                          aiConfidence: '80.00',
                        });
                        dealApprovalsQueued++;
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
                } catch { /* skip duplicate contacts or failed deal creation */ }
              }
            }
          }

          const suggested = await queueFirefliesActionItemsForApproval({
            userId: ctx.user.id,
            meetingId: newMeetingDbId,
            meetingTitle: fullTranscript?.title || t.title || "Unknown meeting",
            firefliesId: t.id,
            actionItems: parseActionItems(actionItems),
            participants,
            // Respect Settings → Fireflies "Auto-create tasks": only when
            // explicitly off do we route items to the Approval Queue instead
            // of creating directly (unset defaults to auto-create, as the UI
            // does).
            routeToApproval: config.autoCreateTasks === false,
          });
          tasksSuggested += suggested;
          if (suggested > 0) {
            await db.updateFirefliesMeeting(newMeetingDbId, {
              processingStatus: "tasks_created",
              processedAt: new Date(),
              autoCreatedTaskCount: suggested,
            });
          }
        } catch (e) {
          console.warn("[CRM Auto-Deal] Failed to create deal from meeting:", e);
        }
      }
      return { synced, skipped, dealApprovalsQueued, contactsCreated, tasksSuggested };
    }),
    processMeeting: protectedProcedure
      .input(z.object({
        meetingId: z.number(),
        createContacts: z.boolean().optional(),
        createTasks: z.boolean().optional(),
        createProject: z.boolean().optional(),
        projectName: z.string().optional(),
        projectId: z.number().optional(),
        assigneeId: z.number().optional(),
        existingContactIds: z.array(z.number()).optional(),
        selectedActionItemIndices: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const meeting = await db.getFirefliesMeetingById(input.meetingId);
        if (!meeting) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Meeting not found' });
        }
        let contactsCreated = 0;
        let tasksCreated = 0;
        let projectId: number | undefined;

        // Create contacts from participants
        const parsedParticipants: Array<{ name: string; email: string }> =
          typeof meeting.participants === 'string' ? JSON.parse(meeting.participants) :
          Array.isArray(meeting.participants) ? meeting.participants : [];
        if (input.createContacts && parsedParticipants.length > 0) {
          const internalEmails = await db.getInternalEmailSet();
          for (const p of parsedParticipants) {
            if (p.email && !internalEmails.has(p.email.toLowerCase())) {
              try {
                const { created } = await db.findOrCreateCrmContact({
                  firstName: (p.name || p.email.split('@')[0]).split(' ')[0] || '',
                  fullName: p.name || p.email.split('@')[0],
                  email: p.email,
                  source: 'manual' as const,
                } as any);
                if (created) contactsCreated++;
              } catch { /* skip on error */ }
            }
          }
        }

        // Log this meeting as a CRM interaction for any explicitly chosen
        // existing contacts (separate from the auto-create-from-participants
        // path above so users can link meetings to contacts who weren't on
        // the call).
        let linkedContactCount = 0;
        if (input.existingContactIds?.length) {
          const overview = (() => {
            try { return JSON.parse(meeting.summary || "")?.overview || ""; } catch { return ""; }
          })();
          for (const contactId of input.existingContactIds) {
            try {
              await db.createCrmInteraction({
                contactId,
                channel: "meeting",
                interactionType: "meeting_completed",
                subject: meeting.title || "Meeting",
                content: overview.substring(0, 500) || undefined,
              });
              linkedContactCount++;
            } catch { /* skip duplicates / failures */ }
          }
        }

        // Create project if requested
        if (input.createProject) {
          const project = await db.createProject({
            projectNumber: `FF-${Date.now()}`,
            name: input.projectName || meeting.title || 'Untitled Meeting Project',
            status: 'planning',
            createdBy: ctx.user.id,
          } as any);
          projectId = project.id;
        }
        if (!projectId && input.projectId) {
          projectId = input.projectId;
        }

        // Queue tasks from action items for approval. Older meetings may have
        // an empty `actionItems` column (the previous parser didn't handle
        // Fireflies' markdown string format) — fall back to re-parsing from
        // the stored `summary` JSON so the Process button still works.
        let actionItemsAvailable = 0;
        if (input.createTasks) {
          let storedItems: Array<{ text: string; assignee?: string; dueDate?: string }> = [];
          try {
            storedItems = meeting.actionItems ? JSON.parse(meeting.actionItems) : [];
          } catch { storedItems = []; }
          if (storedItems.length === 0 && meeting.summary) {
            try {
              const summaryObj = JSON.parse(meeting.summary);
              storedItems = parseActionItems(summaryObj?.action_items);
            } catch { /* leave empty */ }
          }
          actionItemsAvailable = storedItems.length;
          // Honor the user's explicit selection from the preview UI. If
          // selectedActionItemIndices is omitted, default to all items so
          // existing callers stay backwards-compatible. If it's an empty
          // array, the user unchecked everything — process zero.
          let selectedItems: typeof storedItems;
          let stableIndices: number[];
          if (input.selectedActionItemIndices === undefined) {
            selectedItems = storedItems;
            stableIndices = storedItems.map((_, i) => i);
          } else {
            const set = new Set(input.selectedActionItemIndices);
            selectedItems = storedItems.filter((_, i) => set.has(i));
            stableIndices = storedItems
              .map((_, i) => i)
              .filter((i) => set.has(i));
          }
          if (selectedItems.length > 0) {
            const parsedParticipants: Array<{ name: string; email: string }> =
              typeof meeting.participants === 'string' ? JSON.parse(meeting.participants) :
              Array.isArray(meeting.participants) ? meeting.participants : [];
            // forceCreate: user is explicitly invoking Process, so bypass the
            // importance/confidence gates that exist to keep auto-sync quiet.
            tasksCreated += await queueFirefliesActionItemsForApproval({
              userId: ctx.user.id,
              meetingId: meeting.id,
              meetingTitle: meeting.title || 'Untitled meeting',
              actionItems: selectedItems,
              participants: parsedParticipants,
              preferredProjectId: projectId,
              preferredAssigneeId: input.assigneeId,
              forceCreate: true,
              stableIndices,
            });
            await db.updateFirefliesMeeting(input.meetingId, {
              actionItems: JSON.stringify(storedItems),
            });
          }
        }

        const totalContactWork = contactsCreated + linkedContactCount;
        const status: 'fully_processed' | 'contacts_created' | 'tasks_created' | 'pending' =
          totalContactWork > 0 && tasksCreated > 0 ? 'fully_processed'
          : totalContactWork > 0 ? 'contacts_created'
          : tasksCreated > 0 ? 'tasks_created'
          : 'pending';

        await db.updateFirefliesMeeting(input.meetingId, {
          processingStatus: status,
          processedAt: new Date(),
          processedBy: ctx.user.id,
          processingNotes: JSON.stringify({ contactsCreated, linkedContactCount, tasksCreated, projectId }),
          autoCreatedContactCount: contactsCreated + linkedContactCount,
          autoCreatedTaskCount: tasksCreated,
          autoCreatedProjectId: projectId,
        });

        return { contactsCreated, linkedContactCount, tasksCreated, projectId, actionItemsAvailable };
      }),
    taskRoutingOptions: protectedProcedure.query(async () => {
      const projects = await db.getProjects();
      const teamMembers = await db.getTeamMembers();
      return {
        projects: (projects || []).map((p: any) => ({ id: p.id, name: p.name })),
        assignees: (teamMembers || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email })),
      };
    }),
    processAllPending: protectedProcedure
      .input(z.object({
        createContacts: z.boolean().optional(),
        createTasks: z.boolean().optional(),
        createProjects: z.boolean().optional(),
      }).optional())
      .mutation(async ({ input, ctx }) => {
      const meetings = await db.getFirefliesMeetings({ status: 'pending' });
      let processed = 0;
      let contactsCreated = 0;
      let tasksCreated = 0;
      let projectsCreated = 0;
      const doContacts = input?.createContacts !== false;
      const doTasks = input?.createTasks === true;
      const doProjects = input?.createProjects === true;

      // Collect internal user emails once so we never create CRM contacts for them
      const internalEmails = doContacts ? await db.getInternalEmailSet() : new Set<string>();

      for (const meeting of meetings) {
        if (doContacts) {
          // Auto-create contacts from participants
          const parsedParticipants: Array<{ name: string; email: string }> =
            typeof meeting.participants === 'string' ? JSON.parse(meeting.participants) :
            Array.isArray(meeting.participants) ? meeting.participants : [];
          for (const p of parsedParticipants) {
            if (p.email && !internalEmails.has(p.email.toLowerCase())) {
              try {
                const { created } = await db.findOrCreateCrmContact({
                  firstName: (p.name || p.email.split('@')[0]).split(' ')[0] || '',
                  fullName: p.name || p.email.split('@')[0],
                  email: p.email,
                  source: 'manual' as const,
                } as any);
                if (created) contactsCreated++;
              } catch { /* skip on error */ }
            }
          }
        }
        if (doTasks && meeting.actionItems) {
          const items = (meeting.actionItems ? JSON.parse(meeting.actionItems) : []) as Array<{ text: string }>;
          let projectId: number | undefined;
          if (doProjects) {
            const project = await db.createProject({
              projectNumber: `FF-${Date.now()}`,
              name: meeting.title || 'Untitled Meeting Project',
              status: 'planning',
              createdBy: ctx.user.id,
            } as any);
            projectId = project.id;
            projectsCreated++;
          }
          const parsedParticipants: Array<{ name: string; email: string }> =
            typeof meeting.participants === 'string' ? JSON.parse(meeting.participants) :
            Array.isArray(meeting.participants) ? meeting.participants : [];
          tasksCreated += await queueFirefliesActionItemsForApproval({
            userId: ctx.user.id,
            meetingId: meeting.id,
            meetingTitle: meeting.title || 'Untitled meeting',
            actionItems: items as Array<{ text: string; assignee?: string; dueDate?: string }>,
            participants: parsedParticipants,
            preferredProjectId: projectId,
          });
        }
        await db.updateFirefliesMeeting(meeting.id, { processingStatus: 'fully_processed' });
        processed++;
      }
      return { processed, contactsCreated, tasksCreated, projectsCreated };
    }),
    meetings: router({
      list: protectedProcedure
        .input(z.object({ status: z.string().optional() }).optional())
        .query(({ input }) => db.getFirefliesMeetings(input || undefined)),
      get: protectedProcedure
        .input(
          z
            .object({
              id: z.number().optional(),
              firefliesId: z.string().optional(),
            })
            .refine((i) => i.id != null || (i.firefliesId != null && i.firefliesId.length > 0), {
              message: "Provide id or firefliesId",
            }),
        )
        .query(async ({ input }) => {
          if (input.id != null) {
            return db.getFirefliesMeetingById(input.id);
          }
          if (input.firefliesId) {
            return db.getFirefliesMeetingByFirefliesId(input.firefliesId);
          }
          return null;
        }),
      getStats: protectedProcedure.query(async () => {
        return db.getFirefliesMeetingStats();
      }),
    }),
  });
