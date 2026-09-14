// appRouter.crm — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { ENV } from "../_core/env";
import { createAuditLog } from "./_shared";

// ============================================
// CRM MODULE - Contacts, Messaging & Tracking
// ============================================
export const crmRouter = router({
    // --- B2B ROCKET LEADS ---
    // Leads pulled in from B2B Rocket via the Zapier webhook
    // (/webhooks/b2brocket/leads), AI-scored on intake. These are just
    // crmContacts with source = "b2brocket"; this sub-router exposes a
    // score-sorted view + a summary for the outreach UI.
    b2brocketLeads: router({
      list: protectedProcedure
        .input(z.object({
          pipelineStage: z.string().optional(),
          minScore: z.number().optional(),
          search: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(async ({ input }) => {
          const rows = await db.getCrmContacts({
            source: "b2brocket",
            pipelineStage: input?.pipelineStage,
            search: input?.search,
            limit: input?.limit,
            offset: input?.offset,
          });
          const filtered = typeof input?.minScore === "number"
            ? rows.filter((r: any) => (r.leadScore ?? 0) >= input.minScore!)
            : rows;
          // Highest-intent leads first.
          return filtered.sort((a: any, b: any) => (b.leadScore ?? 0) - (a.leadScore ?? 0));
        }),

      stats: protectedProcedure.query(async () => {
        const rows = await db.getCrmContacts({ source: "b2brocket" });
        const total = rows.length;
        const hot = rows.filter((r: any) => (r.leadScore ?? 0) >= 70).length;
        const avgScore = total
          ? Math.round(rows.reduce((s: number, r: any) => s + (r.leadScore ?? 0), 0) / total)
          : 0;
        return { total, hot, avgScore };
      }),
    }),

    // --- CONTACTS ---
    contacts: router({
      list: protectedProcedure
        .input(z.object({
          contactType: z.string().optional(),
          status: z.string().optional(),
          source: z.string().optional(),
          pipelineStage: z.string().optional(),
          assignedTo: z.number().optional(),
          search: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input, ctx }) =>
          db.getCrmContacts({ ...input, excludeEmail: ctx.user.email || undefined }),
        ),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getCrmContactById(input.id)),

      getByEmail: protectedProcedure
        .input(z.object({ email: z.string() }))
        .query(({ input }) => db.getCrmContactByEmail(input.email)),

      create: protectedProcedure
        .input(z.object({
          firstName: z.string().min(1),
          lastName: z.string().optional(),
          fullName: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          whatsappNumber: z.string().optional(),
          linkedinUrl: z.string().optional(),
          organization: z.string().optional(),
          jobTitle: z.string().optional(),
          department: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          postalCode: z.string().optional(),
          contactType: z.enum(["lead", "prospect", "customer", "partner", "investor", "donor", "vendor", "other"]).optional(),
          source: z.enum(["iphone_bump", "whatsapp", "linkedin_scan", "business_card", "website", "referral", "event", "cold_outreach", "import", "manual"]).optional(),
          pipelineStage: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]).optional(),
          dealValue: z.string().optional(),
          notes: z.string().optional(),
          tags: z.string().optional(),
          assignedTo: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const fullName = input.fullName || `${input.firstName} ${input.lastName || ""}`.trim();

          // Skip self: don't let the logged-in user create a contact for themselves.
          const ownEmail = ctx.user.email?.trim().toLowerCase();
          if (ownEmail && input.email && input.email.trim().toLowerCase() === ownEmail) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This is your own email. Update your user profile instead of creating a CRM contact.",
            });
          }

          const { id, created } = await db.findOrCreateCrmContact({
            ...input,
            fullName,
            capturedBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, created ? 'create' : 'update', 'crm_contact', id, fullName);
          return { id, merged: !created };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          fullName: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          whatsappNumber: z.string().optional(),
          linkedinUrl: z.string().optional(),
          organization: z.string().optional(),
          jobTitle: z.string().optional(),
          department: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country: z.string().optional(),
          postalCode: z.string().optional(),
          contactType: z.enum(["lead", "prospect", "customer", "partner", "investor", "donor", "vendor", "other"]).optional(),
          status: z.enum(["active", "inactive", "unsubscribed", "bounced"]).optional(),
          pipelineStage: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]).optional(),
          dealValue: z.string().optional(),
          notes: z.string().optional(),
          tags: z.string().optional(),
          assignedTo: z.number().optional(),
          nextFollowUpAt: z.date().optional(),
          preferredChannel: z.enum(["email", "whatsapp", "phone", "sms", "linkedin"]).optional(),
          optedOutEmail: z.boolean().optional(),
          optedOutSms: z.boolean().optional(),
          optedOutWhatsapp: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          const existing = await db.getCrmContactById(id);
          await db.updateCrmContact(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_contact', id, existing?.fullName, existing, data);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const existing = await db.getCrmContactById(input.id);
          await db.deleteCrmContact(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'crm_contact', input.id, existing?.fullName);
          return { success: true };
        }),

      deleteAll: protectedProcedure
        .mutation(async ({ ctx }) => {
          const count = await db.deleteAllCrmContacts();
          await createAuditLog(ctx.user.id, 'delete', 'crm_contact', 0, `Bulk deleted all ${count} contacts`);
          return { deleted: count };
        }),

      deletePlaceholders: protectedProcedure
        .mutation(async ({ ctx }) => {
          const database = await db.getDb();
          if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
          const { crmContacts } = await import("../../drizzle/schema");
          const all = await database.select().from(crmContacts);
          const placeholders = all.filter((c: any) => {
            const name = (c.fullName || c.firstName || "").trim();
            return /^(Contact|Test|Placeholder|Sample)\s*\d*$/i.test(name) || name === "" || name === "-";
          });
          for (const p of placeholders) {
            await database.delete(crmContacts).where(eq(crmContacts.id, p.id));
          }
          await createAuditLog(ctx.user.id, 'delete', 'crm_contact', 0, `Deleted ${placeholders.length} placeholder contacts`);
          return { deleted: placeholders.length };
        }),

      getStats: protectedProcedure.query(() => db.getCrmContactStats()),

      findDuplicates: protectedProcedure.query(async () => {
        const groups = await db.findDuplicateCrmContactGroups();
        return { groups, totalDuplicates: groups.reduce((n, g) => n + g.contacts.length - 1, 0) };
      }),

      merge: protectedProcedure
        .input(z.object({ primaryId: z.number(), duplicateIds: z.array(z.number()).min(1) }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.mergeCrmContacts(input.primaryId, input.duplicateIds);
          await createAuditLog(ctx.user.id, 'update', 'crm_contact', input.primaryId, `merged ${result.merged} duplicates`);
          return result;
        }),

      // One-click cleanup: auto-merge every duplicate group, keeping the
      // oldest contact (lowest id) as the primary.
      autoMergeDuplicates: protectedProcedure.mutation(async ({ ctx }) => {
        const groups = await db.findDuplicateCrmContactGroups();
        let merged = 0;
        let groupsMerged = 0;
        for (const g of groups) {
          const sorted = [...g.contacts].sort((a: any, b: any) => a.id - b.id);
          const primary = sorted[0];
          const dupeIds = sorted.slice(1).map((c: any) => c.id);
          if (dupeIds.length === 0) continue;
          const result = await db.mergeCrmContacts(primary.id, dupeIds);
          merged += result.merged;
          groupsMerged++;
        }
        if (merged > 0) {
          await createAuditLog(ctx.user.id, 'update', 'crm_contact', 0, `auto-merged ${merged} duplicates across ${groupsMerged} groups`);
        }
        return { merged, groupsMerged };
      }),

      getTimeline: protectedProcedure
        .input(z.object({ contactId: z.number(), limit: z.number().optional() }))
        .query(({ input }) => db.getContactTimeline(input.contactId, input.limit)),

      getMessagingHistory: protectedProcedure
        .input(z.object({ contactId: z.number(), limit: z.number().optional() }))
        .query(({ input }) => db.getUnifiedMessagingHistory(input.contactId, input.limit)),

      // Export unified messaging history (WhatsApp + email + other channels)
      // for a single contact. Returns base64 (xlsx/pdf) or utf-8 (csv).
      exportMessagingHistory: protectedProcedure
        .input(z.object({
          contactId: z.number(),
          format: z.enum(["csv", "xlsx", "pdf"]),
          limit: z.number().max(5000).optional(),
        }))
        .mutation(async ({ input }) => {
          const { exportMessages } = await import("../_core/messageExport");
          const contact = await db.getCrmContactById(input.contactId);
          const history = await db.getUnifiedMessagingHistory(input.contactId, input.limit ?? 1000);
          // Flatten the {type, data, ...} envelope into the row shape exportMessages expects.
          const rows = (history as any[]).map((h: any) => {
            const d = h.data || {};
            return {
              id: h.id,
              channel: h.type, // "whatsapp" | "email" | ...
              direction: h.direction,
              content: h.content || d.bodyText || d.subject || "",
              subject: d.subject,
              status: h.status,
              whatsappNumber: d.whatsappNumber,
              fromName: d.fromName,
              toName: d.toEmail || d.contactName,
              messageType: d.messageType,
              sentAt: d.sentAt,
              receivedAt: d.receivedAt,
              createdAt: d.createdAt || h.timestamp,
              conversationId: d.conversationId,
            };
          });
          const name = contact?.fullName || contact?.firstName || `contact_${input.contactId}`;
          const label = `messages_${name.replace(/\s+/g, "_")}`;
          try {
            return await exportMessages(rows, input.format, label, name);
          } catch (error) {
            // exportMessages throws when the headless browser cannot start.
            // CSV and XLSX never reach this path, so the message names the
            // formats that still work.
            console.error('[crm.contacts.exportMessagingHistory] export failed:', error);
            throw new TRPCError({
              code: 'SERVICE_UNAVAILABLE',
              message: 'PDF generation is currently unavailable. Export as CSV or XLSX instead.',
              cause: error,
            });
          }
        }),
    }),

    // --- TAGS ---
    tags: router({
      list: protectedProcedure
        .input(z.object({ category: z.string().optional() }).optional())
        .query(({ input }) => db.getCrmTags(input?.category)),

      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1),
          color: z.string().optional(),
          category: z.enum(["contact", "deal", "general"]).optional(),
        }))
        .mutation(async ({ input }) => {
          const id = await db.createCrmTag(input);
          return { id };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteCrmTag(input.id);
          return { success: true };
        }),

      addToContact: protectedProcedure
        .input(z.object({ contactId: z.number(), tagId: z.number() }))
        .mutation(async ({ input }) => {
          await db.addTagToContact(input.contactId, input.tagId);
          return { success: true };
        }),

      removeFromContact: protectedProcedure
        .input(z.object({ contactId: z.number(), tagId: z.number() }))
        .mutation(async ({ input }) => {
          await db.removeTagFromContact(input.contactId, input.tagId);
          return { success: true };
        }),

      getForContact: protectedProcedure
        .input(z.object({ contactId: z.number() }))
        .query(({ input }) => db.getContactTags(input.contactId)),
    }),

    // --- WHATSAPP ---
    whatsapp: router({
      messages: protectedProcedure
        .input(z.object({
          contactId: z.number().optional(),
          whatsappNumber: z.string().optional(),
          direction: z.string().optional(),
          conversationId: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getWhatsappMessages(input)),

      conversations: protectedProcedure
        .input(z.object({ limit: z.number().optional() }).optional())
        .query(({ input }) => db.getWhatsappConversations(input?.limit)),

      sendMessage: protectedProcedure
        .input(z.object({
          contactId: z.number().optional(),
          whatsappNumber: z.string(),
          contactName: z.string().optional(),
          content: z.string(),
          messageType: z.enum(["text", "image", "video", "audio", "document", "location", "contact", "template"]).optional(),
          templateName: z.string().optional(),
          templateParams: z.string().optional(),
          conversationId: z.string().optional(),
          // Optional linkage to another record (e.g. a shipment) so supplier
          // chatter can be tied to the thing it's about.
          relatedEntityType: z.string().optional(),
          relatedEntityId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const conversationId = input.conversationId || `wa_${input.whatsappNumber}_${Date.now()}`;

          // Record the outbound message immediately (status pending).
          const id = await db.createWhatsappMessage({
            ...input,
            direction: "outbound",
            status: "pending",
            sentBy: ctx.user.id,
            conversationId,
          });

          // Send for real via the Twilio WhatsApp Business API when configured.
          // If not configured, the message stays a local "pending" log.
          let status: "pending" | "sent" | "failed" = "pending";
          let failedReason: string | undefined;
          if (ENV.twilioAccountSid && ENV.twilioAuthToken && ENV.twilioWhatsappNumber) {
            const withChannel = (n: string) =>
              n.startsWith("whatsapp:") ? n : `whatsapp:${n.startsWith("+") ? n : `+${n.replace(/[^\d]/g, "")}`}`;
            try {
              const twilioMod = await import("twilio");
              const client = twilioMod.default(ENV.twilioAccountSid, ENV.twilioAuthToken);
              const msg = await client.messages.create({
                to: withChannel(input.whatsappNumber),
                from: withChannel(ENV.twilioWhatsappNumber),
                body: input.content,
                ...(ENV.publicAppUrl && ENV.publicAppUrl !== "http://localhost:3000"
                  ? { statusCallback: `${ENV.publicAppUrl.replace(/\/$/, "")}/api/twilio/whatsapp/status` }
                  : {}),
              });
              status = "sent";
              await db.updateWhatsappMessage(id, { status: "sent", messageId: msg.sid, sentAt: new Date() });
            } catch (err) {
              status = "failed";
              failedReason = (err as Error).message;
              await db.updateWhatsappMessage(id, { status: "failed", failedReason });
            }
          }

          // Also create an interaction record
          if (input.contactId) {
            await db.createCrmInteraction({
              contactId: input.contactId,
              channel: "whatsapp",
              interactionType: "sent",
              content: input.content,
              whatsappMessageId: id,
              performedBy: ctx.user.id,
            });
          }

          return { id, status, failedReason };
        }),

      logInbound: protectedProcedure
        .input(z.object({
          whatsappNumber: z.string(),
          contactName: z.string().optional(),
          messageId: z.string().optional(),
          conversationId: z.string().optional(),
          content: z.string(),
          messageType: z.enum(["text", "image", "video", "audio", "document", "location", "contact", "template"]).optional(),
          mediaUrl: z.string().optional(),
          receivedAt: z.date().optional(),
        }))
        .mutation(async ({ input }) => {
          // Find contact by WhatsApp number
          const contacts = await db.getCrmContacts({ search: input.whatsappNumber, limit: 1 });
          const contact = contacts[0];

          const id = await db.createWhatsappMessage({
            ...input,
            contactId: contact?.id,
            direction: "inbound",
            status: "delivered",
            sentAt: input.receivedAt || new Date(),
          });

          // Create interaction if contact exists
          if (contact) {
            await db.createCrmInteraction({
              contactId: contact.id,
              channel: "whatsapp",
              interactionType: "received",
              content: input.content,
              whatsappMessageId: id,
            });

            // Update contact's last replied timestamp
            await db.updateCrmContact(contact.id, { lastRepliedAt: new Date() });
          }

          return { id, contactId: contact?.id };
        }),

      updateStatus: protectedProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(["pending", "sent", "delivered", "read", "failed"]),
        }))
        .mutation(async ({ input }) => {
          await db.updateWhatsappMessageStatus(input.id, input.status, new Date());
          return { success: true };
        }),

      // Export WhatsApp messages to CSV, XLSX, or PDF. Filter by contact,
      // conversation, or number. Returns base64 (xlsx/pdf) or utf-8 (csv).
      exportMessages: protectedProcedure
        .input(z.object({
          format: z.enum(["csv", "xlsx", "pdf"]),
          contactId: z.number().optional(),
          whatsappNumber: z.string().optional(),
          conversationId: z.string().optional(),
          limit: z.number().max(5000).optional(),
        }))
        .mutation(async ({ input }) => {
          const { exportMessages } = await import("../_core/messageExport");
          const msgs = await db.getWhatsappMessages({
            contactId: input.contactId,
            whatsappNumber: input.whatsappNumber,
            conversationId: input.conversationId,
            limit: input.limit ?? 1000,
          });
          const tagged = msgs.map((m: any) => ({ ...m, channel: "whatsapp" }));

          let label = "whatsapp_messages";
          let subtitle: string | undefined;
          if (input.contactId) {
            const c = await db.getCrmContactById(input.contactId);
            if (c) {
              label = `whatsapp_${(c.fullName || c.firstName || `contact_${input.contactId}`).replace(/\s+/g, "_")}`;
              subtitle = c.fullName || c.firstName || undefined;
            }
          } else if (input.whatsappNumber) {
            label = `whatsapp_${input.whatsappNumber.replace(/[^0-9]/g, "")}`;
            subtitle = input.whatsappNumber;
          }

          try {
            return await exportMessages(tagged, input.format, label, subtitle);
          } catch (error) {
            // exportMessages throws when the headless browser cannot start.
            // CSV and XLSX never reach this path, so the message names the
            // formats that still work.
            console.error('[crm.whatsapp.exportMessages] export failed:', error);
            throw new TRPCError({
              code: 'SERVICE_UNAVAILABLE',
              message: 'PDF generation is currently unavailable. Export as CSV or XLSX instead.',
              cause: error,
            });
          }
        }),
    }),

    // --- INTERACTIONS ---
    interactions: router({
      list: protectedProcedure
        .input(z.object({
          contactId: z.number().optional(),
          channel: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getCrmInteractions(input)),

      create: protectedProcedure
        .input(z.object({
          contactId: z.number(),
          channel: z.enum(["email", "whatsapp", "sms", "phone", "meeting", "linkedin", "note", "task"]),
          interactionType: z.enum(["sent", "received", "call_made", "call_received", "meeting_scheduled", "meeting_completed", "note_added", "task_completed"]),
          subject: z.string().optional(),
          content: z.string().optional(),
          summary: z.string().optional(),
          callDuration: z.number().optional(),
          callOutcome: z.enum(["answered", "voicemail", "no_answer", "busy", "wrong_number"]).optional(),
          meetingStartTime: z.date().optional(),
          meetingEndTime: z.date().optional(),
          meetingLocation: z.string().optional(),
          meetingLink: z.string().optional(),
          relatedDealId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmInteraction({
            ...input,
            performedBy: ctx.user.id,
          });
          return { id };
        }),

      logCall: protectedProcedure
        .input(z.object({
          contactId: z.number(),
          direction: z.enum(["outbound", "inbound"]),
          duration: z.number().optional(),
          outcome: z.enum(["answered", "voicemail", "no_answer", "busy", "wrong_number"]),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmInteraction({
            contactId: input.contactId,
            channel: "phone",
            interactionType: input.direction === "outbound" ? "call_made" : "call_received",
            callDuration: input.duration,
            callOutcome: input.outcome,
            content: input.notes,
            performedBy: ctx.user.id,
          });
          return { id };
        }),

      logMeeting: protectedProcedure
        .input(z.object({
          contactId: z.number(),
          subject: z.string(),
          startTime: z.date(),
          endTime: z.date().optional(),
          location: z.string().optional(),
          meetingLink: z.string().optional(),
          notes: z.string().optional(),
          completed: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmInteraction({
            contactId: input.contactId,
            channel: "meeting",
            interactionType: input.completed ? "meeting_completed" : "meeting_scheduled",
            subject: input.subject,
            meetingStartTime: input.startTime,
            meetingEndTime: input.endTime,
            meetingLocation: input.location,
            meetingLink: input.meetingLink,
            content: input.notes,
            performedBy: ctx.user.id,
          });
          return { id };
        }),

      addNote: protectedProcedure
        .input(z.object({
          contactId: z.number(),
          content: z.string(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmInteraction({
            contactId: input.contactId,
            channel: "note",
            interactionType: "note_added",
            content: input.content,
            performedBy: ctx.user.id,
          });
          return { id };
        }),
    }),

    // --- PIPELINES ---
    pipelines: router({
      list: protectedProcedure
        .input(z.object({ type: z.string().optional() }).optional())
        .query(({ input }) => db.getCrmPipelines(input?.type)),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getCrmPipelineById(input.id)),

      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1),
          type: z.enum(["sales", "fundraising", "partnerships", "other"]),
          stages: z.string(), // JSON array
          isDefault: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmPipeline(input);
          await createAuditLog(ctx.user.id, 'create', 'crm_pipeline', id, input.name);
          return { id };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          stages: z.string().optional(),
          isDefault: z.boolean().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateCrmPipeline(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_pipeline', id);
          return { success: true };
        }),
    }),

    // --- DEALS ---
    deals: router({
      list: protectedProcedure
        .input(z.object({
          pipelineId: z.number().optional(),
          contactId: z.number().optional(),
          stage: z.string().optional(),
          status: z.string().optional(),
          assignedTo: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getCrmDeals(input)),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getCrmDealById(input.id)),

      create: protectedProcedure
        .input(z.object({
          pipelineId: z.number(),
          contactId: z.number(),
          name: z.string().min(1).optional(), // Ignored — deal title is always the contact's company.
          description: z.string().optional(),
          stage: z.string(),
          amount: z.string().optional(),
          currency: z.string().optional(),
          probability: z.number().optional(),
          expectedCloseDate: z.date().optional(),
          source: z.string().optional(),
          campaign: z.string().optional(),
          notes: z.string().optional(),
          assignedTo: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Deal title must be the contact's client company name.
          const contact = await db.getCrmContactById(input.contactId);
          if (!contact) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' });
          }
          const company = (contact.organization || '').trim();
          if (!company) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Cannot create deal: contact "${contact.fullName}" has no company. Add a company to the contact first.`,
            });
          }

          // Reject duplicates up front — same company can't have two deals.
          const existing = await db.findCrmDealByCompany(company);
          if (existing) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `A deal already exists for "${company}" (deal #${existing.id}).`,
            });
          }

          // Block if another approval task is already queued for this company.
          if (await db.hasPendingDealApprovalForCompany(company)) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `An approval is already pending for "${company}".`,
            });
          }

          const taskData = {
            pipelineId: input.pipelineId,
            contactId: input.contactId,
            company,
            stage: input.stage,
            amount: input.amount,
            source: input.source,
            notes: input.notes,
            assignedTo: input.assignedTo || ctx.user.id,
          };
          const task = await db.createAiAgentTask({
            taskType: 'create_crm_deal',
            priority: 'medium',
            status: 'pending_approval',
            taskData: JSON.stringify(taskData),
            aiReasoning: `New CRM deal for "${company}" submitted by ${ctx.user.name} for approval.`,
            aiConfidence: '100.00',
          });
          await db.createAiAgentLog({
            taskId: task.id,
            action: 'task_created',
            status: 'info',
            message: `CRM deal approval requested by ${ctx.user.name}`,
            details: JSON.stringify(taskData),
          });
          await createAuditLog(ctx.user.id, 'create', 'crm_deal_request', task.id, company);
          return { taskId: task.id, pendingApproval: true, company };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          stage: z.string().optional(),
          amount: z.string().optional(),
          probability: z.number().optional(),
          expectedCloseDate: z.date().optional(),
          status: z.enum(["open", "won", "lost", "stalled"]).optional(),
          lostReason: z.string().optional(),
          notes: z.string().optional(),
          assignedTo: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          const existing = await db.getCrmDealById(id);
          await db.updateCrmDeal(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_deal', id, existing?.name, existing, data);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const existing = await db.getCrmDealById(input.id);
          await db.deleteCrmDeal(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'crm_deal', input.id, existing?.name);
          return { success: true };
        }),

      getStats: protectedProcedure
        .input(z.object({ pipelineId: z.number().optional() }).optional())
        .query(({ input }) => db.getCrmDealStats(input?.pipelineId)),

      findDuplicates: protectedProcedure.query(async () => {
        const groups = await db.findDuplicateCrmDealGroups();
        return { groups, totalDuplicates: groups.reduce((n: number, g: any) => n + g.deals.length - 1, 0) };
      }),

      merge: protectedProcedure
        .input(z.object({ primaryId: z.number(), duplicateIds: z.array(z.number()).min(1) }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.mergeCrmDeals(input.primaryId, input.duplicateIds);
          await createAuditLog(ctx.user.id, 'update', 'crm_deal', input.primaryId, `merged ${result.merged} duplicates`);
          return result;
        }),

      autoMergeDuplicates: protectedProcedure.mutation(async ({ ctx }) => {
        const groups = await db.findDuplicateCrmDealGroups();
        let merged = 0;
        let groupsMerged = 0;
        const score = (d: any) =>
          (d.contactId ? 10 : 0) +
          (d.amount && Number(d.amount) > 0 ? 5 : 0) +
          (d.notes ? Math.min(3, d.notes.length / 50) : 0) +
          (d.status === 'open' ? 1 : 0);
        const seen = new Set<number>();
        for (const g of groups as any[]) {
          const candidates = g.deals.filter((d: any) => !seen.has(d.id));
          if (candidates.length < 2) continue;
          const sorted = [...candidates].sort((a, b) => score(b) - score(a) || a.id - b.id);
          const primary = sorted[0];
          const dupeIds = sorted.slice(1).map((d: any) => d.id);
          if (dupeIds.length === 0) continue;
          const result = await db.mergeCrmDeals(primary.id, dupeIds);
          merged += result.merged;
          groupsMerged++;
          seen.add(primary.id);
          dupeIds.forEach((id: number) => seen.add(id));
        }
        if (merged > 0) {
          await createAuditLog(ctx.user.id, 'update', 'crm_deal', 0, `auto-merged ${merged} duplicates across ${groupsMerged} groups`);
        }
        return { merged, groupsMerged };
      }),

      cleanupLegacyMeetingDeals: protectedProcedure.mutation(async ({ ctx }) => {
        const result = await db.cleanupLegacyMeetingDeals();
        if (result.renamed > 0 || result.merged > 0) {
          await createAuditLog(
            ctx.user.id,
            'update',
            'crm_deal',
            0,
            `legacy cleanup: renamed ${result.renamed}, merged ${result.merged} across ${result.groupsMerged} groups`,
          );
        }
        return result;
      }),

      moveStage: protectedProcedure
        .input(z.object({
          id: z.number(),
          stage: z.string(),
          probability: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const existing = await db.getCrmDealById(input.id);
          await db.updateCrmDeal(input.id, {
            stage: input.stage,
            probability: input.probability,
          });
          await createAuditLog(ctx.user.id, 'update', 'crm_deal', input.id, existing?.name, { stage: existing?.stage }, { stage: input.stage });
          return { success: true };
        }),

      getNextSteps: protectedProcedure
        .input(z.object({ dealId: z.number() }))
        .query(async ({ input }) => {
          const deal = await db.getCrmDealById(input.dealId);
          if (!deal) return { steps: [] };

          // Get the contact for this deal
          const contact = deal.contactId ? await db.getCrmContactById(deal.contactId) : null;

          // Get recent interactions
          const interactions = deal.contactId ? await db.getCrmInteractions({ contactId: deal.contactId }) : [];

          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are a sales coach. Based on the deal details and interaction history, suggest 3-5 concrete next steps to advance this deal. Be specific and actionable.

Return JSON: { "steps": [{ "action": "what to do", "priority": "high|medium|low", "reasoning": "why this matters", "suggestedDate": "when to do it (relative like 'tomorrow', 'this week', 'next Monday')" }] }`
              },
              {
                role: "user",
                content: `Deal: ${deal.name}
Stage: ${deal.stage}
Amount: $${deal.amount || 'not set'}
Contact: ${contact?.fullName || contact?.firstName || 'Unknown'} at ${contact?.organization || 'Unknown'}
Title: ${contact?.jobTitle || 'Unknown'}
Source: ${deal.source || 'Unknown'}
Notes: ${deal.notes || 'None'}
Recent interactions: ${(interactions as any[]).slice(0, 5).map((i: any) => `${i.type || i.channel}: ${i.subject || i.notes || ''}`).join('; ') || 'None'}`
              },
            ],
          });

          try {
            const content = response.choices?.[0]?.message?.content;
            const cleaned = (typeof content === 'string' ? content : '').replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(cleaned);
          } catch {
            return { steps: [{ action: "Follow up with contact", priority: "high", reasoning: "Keep the conversation going", suggestedDate: "this week" }] };
          }
        }),
    }),

    // --- CONTACT CAPTURES ---
    captures: router({
      list: protectedProcedure
        .input(z.object({
          status: z.string().optional(),
          captureMethod: z.string().optional(),
          capturedBy: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getContactCaptures(input)),

      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getContactCaptureById(input.id)),

      // iPhone bump / AirDrop / NFC vCard capture
      captureVCard: protectedProcedure
        .input(z.object({
          vcardData: z.string(),
          captureMethod: z.enum(["iphone_bump", "airdrop", "nfc", "qr_code"]),
          eventName: z.string().optional(),
          eventLocation: z.string().optional(),
          deviceType: z.string().optional(),
          deviceId: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Create capture record
          const captureId = await db.createContactCapture({
            captureMethod: input.captureMethod,
            rawData: input.vcardData,
            vcardData: input.vcardData,
            status: "pending",
            capturedBy: ctx.user.id,
            eventName: input.eventName,
            eventLocation: input.eventLocation,
            deviceType: input.deviceType,
            deviceId: input.deviceId,
            notes: input.notes,
          });

          // Process the vCard and create/update contact
          const contactId = await db.processVCardCapture(captureId, input.vcardData, ctx.user.id);

          return { captureId, contactId };
        }),

      // LinkedIn profile scan
      captureLinkedIn: protectedProcedure
        .input(z.object({
          profileUrl: z.string(),
          name: z.string().optional(),
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          headline: z.string().optional(),
          company: z.string().optional(),
          email: z.string().optional(),
          eventName: z.string().optional(),
          eventLocation: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const linkedinData = {
            profileUrl: input.profileUrl,
            name: input.name,
            firstName: input.firstName,
            lastName: input.lastName,
            headline: input.headline,
            company: input.company,
            email: input.email,
          };

          // Create capture record
          const captureId = await db.createContactCapture({
            captureMethod: "linkedin_scan",
            rawData: JSON.stringify(linkedinData),
            linkedinProfileUrl: input.profileUrl,
            linkedinProfileData: JSON.stringify(linkedinData),
            status: "pending",
            capturedBy: ctx.user.id,
            eventName: input.eventName,
            eventLocation: input.eventLocation,
            notes: input.notes,
          });

          // Process LinkedIn data and create/update contact
          const contactId = await db.processLinkedInCapture(captureId, linkedinData, ctx.user.id);

          return { captureId, contactId };
        }),

      // WhatsApp contact scan
      captureWhatsApp: protectedProcedure
        .input(z.object({
          whatsappNumber: z.string(),
          name: z.string().optional(),
          eventName: z.string().optional(),
          eventLocation: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Check for existing contact by normalized phone/whatsapp.
          const existing = await db.findCrmContactMatch({
            whatsappNumber: input.whatsappNumber,
            phone: input.whatsappNumber,
          });

          if (existing) {
            if (!existing.whatsappNumber) {
              await db.updateCrmContact(existing.id, { whatsappNumber: input.whatsappNumber });
            }
            return { contactId: existing.id, isNew: false };
          }

          // Create new contact (findOrCreate for race-safety)
          const firstName = input.name?.split(" ")[0] || "WhatsApp";
          const lastName = input.name?.split(" ").slice(1).join(" ") || "Contact";
          const fullName = input.name || `WhatsApp ${input.whatsappNumber}`;

          const { id: contactId } = await db.findOrCreateCrmContact({
            firstName,
            lastName,
            fullName,
            whatsappNumber: input.whatsappNumber,
            source: "whatsapp",
            capturedBy: ctx.user.id,
            notes: input.notes,
          });

          // Create capture record
          await db.createContactCapture({
            captureMethod: "whatsapp_scan",
            rawData: JSON.stringify({ whatsappNumber: input.whatsappNumber, name: input.name }),
            status: "contact_created",
            contactId,
            capturedBy: ctx.user.id,
            eventName: input.eventName,
            eventLocation: input.eventLocation,
            notes: input.notes,
          });

          return { contactId, isNew: true };
        }),

      // Business card scan (with OCR)
      captureBusinessCard: protectedProcedure
        .input(z.object({
          imageUrl: z.string(),
          ocrText: z.string().optional(),
          parsedData: z.object({
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            fullName: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            organization: z.string().optional(),
            jobTitle: z.string().optional(),
          }).optional(),
          eventName: z.string().optional(),
          eventLocation: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Create capture record
          const captureId = await db.createContactCapture({
            captureMethod: "business_card_scan",
            rawData: JSON.stringify({ ocrText: input.ocrText, parsedData: input.parsedData }),
            imageUrl: input.imageUrl,
            ocrText: input.ocrText,
            parsedData: input.parsedData ? JSON.stringify(input.parsedData) : undefined,
            status: input.parsedData ? "parsed" : "pending",
            capturedBy: ctx.user.id,
            eventName: input.eventName,
            eventLocation: input.eventLocation,
            notes: input.notes,
          });

          // If we have parsed data, upsert the contact (matches on email/phone/linkedin)
          if (input.parsedData) {
            const firstName = input.parsedData.firstName || input.parsedData.fullName?.split(" ")[0] || "Business";
            const lastName = input.parsedData.lastName || input.parsedData.fullName?.split(" ").slice(1).join(" ") || "Card";
            const fullName = input.parsedData.fullName || `${firstName} ${lastName}`.trim();

            const { id: contactId, created } = await db.findOrCreateCrmContact({
              ...input.parsedData,
              firstName,
              lastName,
              fullName,
              source: "business_card",
              capturedBy: ctx.user.id,
            });

            await db.updateContactCapture(captureId, {
              contactId,
              status: created ? "contact_created" : "merged",
            });
            return { captureId, contactId, isNew: created };
          }

          return { captureId, contactId: null, isNew: false };
        }),

      // Manual processing of pending capture
      processCapture: protectedProcedure
        .input(z.object({
          captureId: z.number(),
          contactData: z.object({
            firstName: z.string(),
            lastName: z.string().optional(),
            fullName: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            whatsappNumber: z.string().optional(),
            organization: z.string().optional(),
            jobTitle: z.string().optional(),
          }),
        }))
        .mutation(async ({ input, ctx }) => {
          const capture = await db.getContactCaptureById(input.captureId);
          if (!capture) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Capture not found" });
          }

          const fullName = input.contactData.fullName || `${input.contactData.firstName} ${input.contactData.lastName || ""}`.trim();

          const { id: contactId, created } = await db.findOrCreateCrmContact({
            ...input.contactData,
            fullName,
            source: capture.captureMethod === "iphone_bump" ? "iphone_bump" :
                    capture.captureMethod === "linkedin_scan" ? "linkedin_scan" :
                    capture.captureMethod === "whatsapp_scan" ? "whatsapp" :
                    capture.captureMethod === "business_card_scan" ? "business_card" : "manual",
            capturedBy: ctx.user.id,
          });

          await db.updateContactCapture(input.captureId, {
            contactId,
            status: created ? "contact_created" : "merged",
            parsedData: JSON.stringify(input.contactData),
          });

          return { contactId, isNew: created };
        }),
    }),

    // --- EMAIL CAMPAIGNS ---
    campaigns: router({
      list: protectedProcedure
        .input(z.object({
          status: z.string().optional(),
          type: z.string().optional(),
          limit: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getCrmEmailCampaigns(input)),

      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1),
          subject: z.string().min(1),
          bodyHtml: z.string(),
          bodyText: z.string().optional(),
          type: z.enum(["newsletter", "drip", "announcement", "follow_up", "custom"]).optional(),
          status: z.enum(["draft", "scheduled", "sending", "sent", "paused", "cancelled"]).optional(),
          targetTags: z.string().optional(),
          targetContactTypes: z.string().optional(),
          targetPipelineStages: z.string().optional(),
          scheduledAt: z.date().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmEmailCampaign({
            ...input,
            createdBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'create', 'crm_campaign', id, input.name);
          return { id };
        }),

      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          subject: z.string().optional(),
          bodyHtml: z.string().optional(),
          bodyText: z.string().optional(),
          type: z.enum(["newsletter", "drip", "announcement", "follow_up", "custom"]).optional(),
          status: z.enum(["draft", "scheduled", "sending", "sent", "paused", "cancelled"]).optional(),
          scheduledAt: z.date().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateCrmEmailCampaign(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_campaign', id);
          return { success: true };
        }),
    }),
    // --- INVESTORS & FUNDRAISING ---
    listInvestors: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getInvestors(input?.companyId)),
    createInvestor: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        title: z.string().optional(),
        type: z.enum(["angel", "vc", "family_office", "strategic", "accelerator", "other"]).default("angel"),
        status: z.enum(["lead", "contacted", "interested", "committed", "invested", "passed"]).default("lead"),
        priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
        linkedinUrl: z.string().optional(),
        website: z.string().optional(),
        source: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => db.createInvestor(input as any)),
    listCampaigns: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getFundraisingCampaigns(input?.companyId)),
    createCampaign: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        targetAmount: z.string().optional(),
        minimumInvestment: z.string().optional(),
        valuation: z.string().optional(),
        roundType: z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c", "bridge", "other"]).default("seed"),
        equityOffered: z.string().optional(),
        status: z.enum(["planning", "active", "paused", "closed", "cancelled"]).default("planning"),
        notes: z.string().optional(),
        companyId: z.number().optional(),
      }))
      .mutation(({ input, ctx }) => {
        const cleaned: Record<string, any> = {
          name: input.name,
          roundType: input.roundType,
          status: input.status,
          createdBy: ctx.user.id,
          companyId: input.companyId ?? (ctx.user as any).companyId ?? null,
        };
        if (input.description) cleaned.description = input.description;
        if (input.targetAmount) cleaned.targetAmount = input.targetAmount;
        if (input.minimumInvestment) cleaned.minimumInvestment = input.minimumInvestment;
        if (input.valuation) cleaned.valuation = input.valuation;
        if (input.equityOffered) cleaned.equityOffered = input.equityOffered;
        if (input.notes) cleaned.notes = input.notes;
        return db.createFundraisingCampaign(cleaned as any);
      }),
    updateCampaign: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        targetAmount: z.string().optional(),
        minimumInvestment: z.string().optional(),
        valuation: z.string().optional(),
        roundType: z.enum(["pre_seed", "seed", "series_a", "series_b", "series_c", "bridge", "other"]).default("seed"),
        equityOffered: z.string().optional(),
        status: z.enum(["planning", "active", "paused", "closed", "cancelled"]).default("planning"),
        notes: z.string().optional(),
        companyId: z.number().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...values } = input;
        const cleaned: Record<string, any> = {
          name: values.name,
          roundType: values.roundType,
          status: values.status,
        };
        cleaned.description = values.description || null;
        cleaned.targetAmount = values.targetAmount || null;
        cleaned.minimumInvestment = values.minimumInvestment || null;
        cleaned.valuation = values.valuation || null;
        cleaned.equityOffered = values.equityOffered || null;
        cleaned.notes = values.notes || null;
        if (values.companyId !== undefined) cleaned.companyId = values.companyId;
        return db.updateFundraisingCampaign(id, cleaned);
      }),
    listInvestments: protectedProcedure
      .input(z.object({ investorId: z.number().optional() }).optional())
      .query(({ input }) => db.getInvestorInvestments(input?.investorId)),
    // Investors linked to a specific fundraising round (campaign).
    listCampaignInvestors: protectedProcedure
      .input(z.object({ campaignId: z.number() }))
      .query(({ input }) => db.getCampaignInvestments(input.campaignId)),
    addCampaignInvestment: protectedProcedure
      .input(z.object({
        campaignId: z.number(),
        investorId: z.number(),
        amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a positive number (up to 2 decimals)"),
        currency: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => db.createInvestment({
        campaignId: input.campaignId,
        investorId: input.investorId,
        amount: input.amount,
        currency: input.currency || "USD",
        notes: input.notes,
      })),
    removeCampaignInvestment: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteInvestment(input.id)),
    listReminders: protectedProcedure
      .input(z.object({ status: z.string().optional(), dueBefore: z.date().optional() }).optional())
      .query(({ input }) => db.getFundraisingReminders(input ? { status: input.status } : undefined)),

    // Admin view of pro-rata interest signaled by existing investors on
    // an open round. Joined with the stakeholder name so IR can follow
    // up offline. Counterpart to `investorPortal.indicateInterest`.
    listProRataIndications: protectedProcedure
      .input(z.object({ campaignId: z.number() }))
      .query(async ({ input }) => {
        const indications = await db.getProRataIndicationsForCampaign(input.campaignId);
        const stakeholderById = new Map(
          (await db.getStakeholders()).map((s: { id: number; name: string; email?: string | null }) => [s.id, s]),
        );
        return (indications as Array<{
          id: number; stakeholderId: number; indicatedAmount: string | null;
          notes: string | null; status: string; createdAt: Date;
        }>).map((i) => {
          const s = stakeholderById.get(i.stakeholderId);
          return {
            id: i.id,
            stakeholderId: i.stakeholderId,
            stakeholderName: s?.name ?? "Unknown",
            stakeholderEmail: s?.email ?? null,
            indicatedAmount: i.indicatedAmount,
            notes: i.notes,
            status: i.status,
            createdAt: i.createdAt,
          };
        });
      }),
  });
