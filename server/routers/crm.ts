// appRouter.crm — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { ENV } from "../_core/env";
import { adminProcedure, internalProcedure, createAuditLog, resolveRequestScope } from "./_shared";
import { scopeAllows, scopeCompanyIds, type Scope } from "../_core/scope";
import { mailableSkipReason, sendCampaign, sendCampaignTest, type CampaignStatus } from "../campaignSender";
import {
  assertValidParentAccount,
  getAccountDetail,
  loadScopedAccount,
  loadScopedCapture,
  loadScopedContact,
  loadScopedContactByEmail,
  loadScopedDeal,
  loadScopedPipeline,
  loadScopedTag,
  scopeIds,
} from "../crmService";
import { crmRowVisible } from "../crmLogic";

// Every CRM procedure resolves the caller's entity scope up front. Reads filter
// by it; by-id reads answer NOT_FOUND for rows outside it.
const scopedProcedure = protectedProcedure.use(async ({ ctx, next }) =>
  next({ ctx: { ...ctx, scope: await resolveRequestScope(ctx.user) } }));
const scopedInternalProcedure = internalProcedure.use(async ({ ctx, next }) =>
  next({ ctx: { ...ctx, scope: await resolveRequestScope(ctx.user) } }));
const scopedAdminProcedure = adminProcedure.use(async ({ ctx, next }) =>
  next({ ctx: { ...ctx, scope: await resolveRequestScope(ctx.user) } }));

// --- Email campaign helpers (used by crm.campaigns) ---

// Sending mail to a contact list is limited to the CRM section's roles.
const CAMPAIGN_SEND_ROLES = ["admin", "exec", "sales"];
const campaignSendProcedure = internalProcedure.use(({ ctx, next }) => {
  if (!CAMPAIGN_SEND_ROLES.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sending campaigns requires a sales, exec or admin role" });
  }
  return next({ ctx });
});

// Recipients can only be changed before the campaign goes out.
const RECIPIENT_EDITABLE: CampaignStatus[] = ["draft", "scheduled", "paused", "partially_failed"];
const SENDABLE: CampaignStatus[] = ["draft", "scheduled", "paused", "partially_failed"];

const contactTypeEnum = z.enum(["lead", "prospect", "customer", "partner", "investor", "donor", "vendor", "other"]);
const pipelineStageEnum = z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]);
const accountTypeEnum = z.enum(["district", "school", "distributor", "operator", "gpo", "other"]);

/** Campaign by id, treated as not found when outside the caller's entity scope. */
async function loadScopedCampaign(id: number, scope: Scope) {
  const campaign = await db.getCrmEmailCampaignById(id);
  if (!campaign || !scopeAllows(scope, campaign.companyId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
  }
  return campaign;
}

/** Parses a JSON-array targeting column; tolerates null / malformed values. */
function parseTargetList(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

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
      list: scopedProcedure
        .input(z.object({
          pipelineStage: z.string().optional(),
          minScore: z.number().optional(),
          search: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(async ({ input, ctx }) => {
          const rows = await db.getCrmContacts({
            source: "b2brocket",
            pipelineStage: input?.pipelineStage,
            search: input?.search,
            limit: input?.limit,
            offset: input?.offset,
            companyIds: scopeIds(ctx.scope),
          });
          const filtered = typeof input?.minScore === "number"
            ? rows.filter((r: any) => (r.leadScore ?? 0) >= input.minScore!)
            : rows;
          // Highest-intent leads first.
          return filtered.sort((a: any, b: any) => (b.leadScore ?? 0) - (a.leadScore ?? 0));
        }),

      stats: scopedProcedure.query(async ({ ctx }) => {
        const rows = await db.getCrmContacts({ source: "b2brocket", companyIds: scopeIds(ctx.scope) });
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
      // The contact book is internal-staff only; external portal roles
      // (vendor, copacker, contractor, investor) must not read it.
      list: scopedInternalProcedure
        .input(z.object({
          contactType: z.string().optional(),
          status: z.string().optional(),
          source: z.string().optional(),
          pipelineStage: z.string().optional(),
          assignedTo: z.number().optional(),
          accountId: z.number().optional(),
          search: z.string().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input, ctx }) =>
          db.getCrmContacts({ ...input, excludeEmail: ctx.user.email || undefined, companyIds: scopeIds(ctx.scope) }),
        ),

      get: scopedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input, ctx }) => loadScopedContact(input.id, ctx.scope)),

      getByEmail: scopedProcedure
        .input(z.object({ email: z.string() }))
        .query(({ input, ctx }) => loadScopedContactByEmail(input.email, ctx.scope)),

      create: scopedProcedure
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
          accountId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const fullName = input.fullName || `${input.firstName} ${input.lastName || ""}`.trim();
          if (input.accountId) await loadScopedAccount(input.accountId, ctx.scope);

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
            companyId: ctx.user.companyId ?? null,
            capturedBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, created ? 'create' : 'update', 'crm_contact', id, fullName);
          return { id, merged: !created };
        }),

      update: scopedProcedure
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
          accountId: z.number().nullable().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          const existing = await loadScopedContact(id, ctx.scope);
          await db.updateCrmContact(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_contact', id, existing.fullName, existing, data);
          return { success: true };
        }),

      delete: scopedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const existing = await loadScopedContact(input.id, ctx.scope);
          await db.deleteCrmContact(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'crm_contact', input.id, existing.fullName);
          return { success: true };
        }),

      deleteAll: adminProcedure
        .mutation(async ({ ctx }) => {
          const count = await db.deleteAllCrmContacts();
          await createAuditLog(ctx.user.id, 'delete', 'crm_contact', 0, `Bulk deleted all ${count} contacts`);
          return { deleted: count };
        }),

      deletePlaceholders: adminProcedure
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

      getTimeline: scopedProcedure
        .input(z.object({ contactId: z.number(), limit: z.number().optional() }))
        .query(async ({ input, ctx }) => {
          await loadScopedContact(input.contactId, ctx.scope);
          return db.getContactTimeline(input.contactId, input.limit);
        }),

      getMessagingHistory: scopedProcedure
        .input(z.object({ contactId: z.number(), limit: z.number().optional() }))
        .query(async ({ input, ctx }) => {
          await loadScopedContact(input.contactId, ctx.scope);
          return db.getUnifiedMessagingHistory(input.contactId, input.limit);
        }),

      // Export unified messaging history (WhatsApp + email + other channels)
      // for a single contact. Returns base64 (xlsx/pdf) or utf-8 (csv).
      exportMessagingHistory: scopedProcedure
        .input(z.object({
          contactId: z.number(),
          format: z.enum(["csv", "xlsx", "pdf"]),
          limit: z.number().max(5000).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { exportMessages } = await import("../_core/messageExport");
          const contact = await loadScopedContact(input.contactId, ctx.scope);
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
          const name = contact.fullName || contact.firstName || `contact_${input.contactId}`;
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
      list: scopedProcedure
        .input(z.object({ category: z.string().optional() }).optional())
        .query(({ input, ctx }) => db.getCrmTags(input?.category, scopeIds(ctx.scope))),

      create: scopedProcedure
        .input(z.object({
          name: z.string().min(1),
          color: z.string().optional(),
          category: z.enum(["contact", "deal", "general"]).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmTag({ ...input, companyId: ctx.user.companyId ?? null });
          return { id };
        }),

      delete: scopedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await loadScopedTag(input.id, ctx.scope);
          await db.deleteCrmTag(input.id);
          return { success: true };
        }),

      addToContact: scopedProcedure
        .input(z.object({ contactId: z.number(), tagId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await loadScopedContact(input.contactId, ctx.scope);
          await loadScopedTag(input.tagId, ctx.scope);
          await db.addTagToContact(input.contactId, input.tagId);
          return { success: true };
        }),

      removeFromContact: scopedProcedure
        .input(z.object({ contactId: z.number(), tagId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await loadScopedContact(input.contactId, ctx.scope);
          await db.removeTagFromContact(input.contactId, input.tagId);
          return { success: true };
        }),

      getForContact: scopedProcedure
        .input(z.object({ contactId: z.number() }))
        .query(async ({ input, ctx }) => {
          await loadScopedContact(input.contactId, ctx.scope);
          return db.getContactTags(input.contactId);
        }),
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
      list: scopedProcedure
        .input(z.object({
          contactId: z.number().optional(),
          channel: z.string().optional(),
          relatedDealId: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input, ctx }) => db.getCrmInteractions({ ...input, companyIds: scopeIds(ctx.scope) })),

      create: scopedProcedure
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
          const contact = await loadScopedContact(input.contactId, ctx.scope);
          if (input.relatedDealId) await loadScopedDeal(input.relatedDealId, ctx.scope);
          const id = await db.createCrmInteraction({
            ...input,
            companyId: contact.companyId,
            performedBy: ctx.user.id,
          });
          return { id };
        }),

      logCall: scopedProcedure
        .input(z.object({
          contactId: z.number(),
          direction: z.enum(["outbound", "inbound"]),
          duration: z.number().optional(),
          outcome: z.enum(["answered", "voicemail", "no_answer", "busy", "wrong_number"]),
          notes: z.string().optional(),
          relatedDealId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const contact = await loadScopedContact(input.contactId, ctx.scope);
          const id = await db.createCrmInteraction({
            contactId: input.contactId,
            companyId: contact.companyId,
            relatedDealId: input.relatedDealId,
            channel: "phone",
            interactionType: input.direction === "outbound" ? "call_made" : "call_received",
            callDuration: input.duration,
            callOutcome: input.outcome,
            content: input.notes,
            performedBy: ctx.user.id,
          });
          return { id };
        }),

      logMeeting: scopedProcedure
        .input(z.object({
          contactId: z.number(),
          subject: z.string(),
          startTime: z.date(),
          endTime: z.date().optional(),
          location: z.string().optional(),
          meetingLink: z.string().optional(),
          notes: z.string().optional(),
          completed: z.boolean().optional(),
          relatedDealId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const contact = await loadScopedContact(input.contactId, ctx.scope);
          const id = await db.createCrmInteraction({
            contactId: input.contactId,
            companyId: contact.companyId,
            relatedDealId: input.relatedDealId,
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

      addNote: scopedProcedure
        .input(z.object({
          contactId: z.number(),
          content: z.string(),
          relatedDealId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const contact = await loadScopedContact(input.contactId, ctx.scope);
          const id = await db.createCrmInteraction({
            contactId: input.contactId,
            companyId: contact.companyId,
            relatedDealId: input.relatedDealId,
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
      list: scopedProcedure
        .input(z.object({ type: z.string().optional() }).optional())
        .query(({ input, ctx }) => db.getCrmPipelines(input?.type, scopeIds(ctx.scope))),

      get: scopedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input, ctx }) => loadScopedPipeline(input.id, ctx.scope)),

      create: scopedProcedure
        .input(z.object({
          name: z.string().min(1),
          type: z.enum(["sales", "fundraising", "partnerships", "other"]),
          stages: z.string(), // JSON array
          isDefault: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createCrmPipeline({ ...input, companyId: ctx.user.companyId ?? null });
          await createAuditLog(ctx.user.id, 'create', 'crm_pipeline', id, input.name);
          return { id };
        }),

      update: scopedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          stages: z.string().optional(),
          isDefault: z.boolean().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await loadScopedPipeline(id, ctx.scope);
          await db.updateCrmPipeline(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_pipeline', id);
          return { success: true };
        }),
    }),

    // --- DEALS ---
    deals: router({
      list: scopedProcedure
        .input(z.object({
          pipelineId: z.number().optional(),
          contactId: z.number().optional(),
          accountId: z.number().optional(),
          stage: z.string().optional(),
          status: z.string().optional(),
          assignedTo: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input, ctx }) => db.getCrmDeals({ ...input, companyIds: scopeIds(ctx.scope) })),

      get: scopedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input, ctx }) => loadScopedDeal(input.id, ctx.scope)),

      create: scopedProcedure
        .input(z.object({
          pipelineId: z.number(),
          contactId: z.number(),
          accountId: z.number().optional(),
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
          const contact = await loadScopedContact(input.contactId, ctx.scope);
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

      update: scopedProcedure
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
          const existing = await loadScopedDeal(id, ctx.scope);
          await db.updateCrmDeal(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_deal', id, existing.name, existing, data);
          return { success: true };
        }),

      delete: scopedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const existing = await loadScopedDeal(input.id, ctx.scope);
          await db.deleteCrmDeal(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'crm_deal', input.id, existing.name);
          return { success: true };
        }),

      getStats: scopedProcedure
        .input(z.object({ pipelineId: z.number().optional() }).optional())
        .query(({ input, ctx }) => db.getCrmDealStats(input?.pipelineId, scopeIds(ctx.scope))),

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

      moveStage: scopedProcedure
        .input(z.object({
          id: z.number(),
          stage: z.string(),
          probability: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const existing = await loadScopedDeal(input.id, ctx.scope);
          await db.updateCrmDeal(input.id, {
            stage: input.stage,
            probability: input.probability,
          });
          await createAuditLog(ctx.user.id, 'update', 'crm_deal', input.id, existing.name, { stage: existing.stage }, { stage: input.stage });
          return { success: true };
        }),

      getNextSteps: scopedProcedure
        .input(z.object({ dealId: z.number() }))
        .query(async ({ input, ctx }) => {
          const deal = await db.getCrmDealById(input.dealId);
          if (!deal || !crmRowVisible(ctx.scope, deal.companyId)) return { steps: [] };

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

    // --- ACCOUNTS ---
    // Customer organisations (districts, schools, distributors…) with a
    // parent/child hierarchy. Contacts and deals hang off an account.
    accounts: router({
      list: scopedInternalProcedure
        .input(z.object({
          type: accountTypeEnum.optional(),
          parentAccountId: z.number().nullable().optional(),
          search: z.string().optional(),
          assignedTo: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input, ctx }) => db.getCrmAccounts({ ...input, companyIds: scopeIds(ctx.scope) })),

      get: scopedInternalProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input, ctx }) => getAccountDetail(input.id, ctx.scope)),

      children: scopedInternalProcedure
        .input(z.object({ accountId: z.number() }))
        .query(async ({ input, ctx }) => {
          await loadScopedAccount(input.accountId, ctx.scope);
          return db.getCrmAccountChildren(input.accountId);
        }),

      create: scopedInternalProcedure
        .input(z.object({
          name: z.string().min(1),
          type: accountTypeEnum.optional(),
          parentAccountId: z.number().nullable().optional(),
          region: z.string().optional(),
          mealCount: z.number().int().nonnegative().nullable().optional(),
          externalId: z.string().optional(),
          customerId: z.number().nullable().optional(),
          website: z.string().optional(),
          notes: z.string().optional(),
          assignedTo: z.number().nullable().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          if (input.parentAccountId) await assertValidParentAccount(null, input.parentAccountId, ctx.scope);
          const id = await db.createCrmAccount({ ...input, companyId: ctx.user.companyId ?? null });
          await createAuditLog(ctx.user.id, 'create', 'crm_account', id, input.name);
          return { id };
        }),

      update: scopedInternalProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          type: accountTypeEnum.optional(),
          parentAccountId: z.number().nullable().optional(),
          region: z.string().nullable().optional(),
          mealCount: z.number().int().nonnegative().nullable().optional(),
          externalId: z.string().nullable().optional(),
          customerId: z.number().nullable().optional(),
          website: z.string().nullable().optional(),
          notes: z.string().nullable().optional(),
          assignedTo: z.number().nullable().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          const existing = await loadScopedAccount(id, ctx.scope);
          if (data.parentAccountId) await assertValidParentAccount(id, data.parentAccountId, ctx.scope);
          await db.updateCrmAccount(id, data);
          await createAuditLog(ctx.user.id, 'update', 'crm_account', id, existing.name, existing, data);
          return { success: true };
        }),

      // One account per distinct contact `organization`; links contacts and
      // their deals. Re-runnable.
      backfill: scopedAdminProcedure.mutation(async ({ ctx }) => {
        const result = await db.backfillAccountsFromOrganization(scopeIds(ctx.scope));
        await createAuditLog(ctx.user.id, 'update', 'crm_account', 0, `backfill: ${result.accountsCreated} accounts, ${result.contactsLinked} contacts, ${result.dealsLinked} deals`);
        return result;
      }),
    }),

    // --- CONTACT CAPTURES ---
    captures: router({
      list: scopedProcedure
        .input(z.object({
          status: z.string().optional(),
          captureMethod: z.string().optional(),
          capturedBy: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        }).optional())
        .query(({ input, ctx }) => db.getContactCaptures({ ...input, companyIds: scopeIds(ctx.scope) })),

      get: scopedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input, ctx }) => loadScopedCapture(input.id, ctx.scope)),

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
            companyId: ctx.user.companyId ?? null,
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
            companyId: ctx.user.companyId ?? null,
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
            companyId: ctx.user.companyId ?? null,
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
            companyId: ctx.user.companyId ?? null,
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
      processCapture: scopedProcedure
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
          const capture = await loadScopedCapture(input.captureId, ctx.scope);

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
        .query(async ({ input, ctx }) => {
          const rows = await db.getCrmEmailCampaigns(input);
          const scope = await resolveRequestScope(ctx.user);
          return scope.companyIds === "all" ? rows : rows.filter((c) => scopeAllows(scope, c.companyId));
        }),

      get: internalProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => loadScopedCampaign(input.id, await resolveRequestScope(ctx.user))),

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
            companyId: ctx.user.companyId ?? null,
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

      recipients: internalProcedure
        .input(z.object({ campaignId: z.number() }))
        .query(async ({ input, ctx }) => {
          await loadScopedCampaign(input.campaignId, await resolveRequestScope(ctx.user));
          const rows = await db.getCrmCampaignRecipients(input.campaignId);
          const contacts = new Map((await db.getCrmContactsByIds(Array.from(new Set(rows.map((r) => r.contactId))))).map((c) => [c.id, c]));
          return rows.map((r) => ({ ...r, contactName: contacts.get(r.contactId)?.fullName ?? null }));
        }),

      // Adds explicit contacts and/or a segment (contact types, pipeline
      // stages, tag ids — or the campaign's own target* fields). Contacts
      // with no email, opted out, or outside the caller's entities are skipped.
      addRecipients: internalProcedure
        .input(z.object({
          campaignId: z.number(),
          contactIds: z.array(z.number().int().positive()).max(5000).optional(),
          segment: z.object({
            useCampaignTargeting: z.boolean().optional(),
            contactTypes: z.array(contactTypeEnum).optional(),
            pipelineStages: z.array(pipelineStageEnum).optional(),
            tagIds: z.array(z.number().int().positive()).optional(),
          }).optional(),
        }).refine((v) => (v.contactIds?.length ?? 0) > 0 || !!v.segment, { message: "Provide contactIds or a segment" }))
        .mutation(async ({ input, ctx }) => {
          const scope = await resolveRequestScope(ctx.user);
          const campaign = await loadScopedCampaign(input.campaignId, scope);
          if (!RECIPIENT_EDITABLE.includes(campaign.status ?? "draft")) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Recipients cannot be changed while the campaign is ${campaign.status}` });
          }

          const skipped: Array<{ contactId: number; reason: string }> = [];
          const candidates: Array<{ contactId: number; email: string }> = [];

          if (input.contactIds?.length) {
            const ids = Array.from(new Set(input.contactIds));
            const found = new Map((await db.getCrmContactsByIds(ids)).map((c) => [c.id, c]));
            for (const id of ids) {
              const c = found.get(id);
              if (!c || !scopeAllows(scope, c.companyId)) { skipped.push({ contactId: id, reason: "Contact not found" }); continue; }
              const skip = mailableSkipReason(c);
              if (skip || !c.email) { skipped.push({ contactId: id, reason: skip?.reason ?? "Contact has no email address" }); continue; }
              candidates.push({ contactId: c.id, email: c.email.trim() });
            }
          }

          if (input.segment) {
            const seg = input.segment;
            const contactTypes: string[] = [...(seg.contactTypes ?? [])];
            const pipelineStages: string[] = [...(seg.pipelineStages ?? [])];
            const tagIds: number[] = [...(seg.tagIds ?? [])];
            if (seg.useCampaignTargeting) {
              for (const v of parseTargetList(campaign.targetContactTypes)) if (contactTypeEnum.safeParse(v).success) contactTypes.push(String(v));
              for (const v of parseTargetList(campaign.targetPipelineStages)) if (pipelineStageEnum.safeParse(v).success) pipelineStages.push(String(v));
              for (const v of parseTargetList(campaign.targetTags)) { const n = Number(v); if (Number.isInteger(n) && n > 0) tagIds.push(n); }
            }
            if (!contactTypes.length && !pipelineStages.length && !tagIds.length) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "The segment has no criteria (set contact types, pipeline stages or tags)" });
            }
            const matches = await db.getCrmContactsForSegment({ contactTypes, pipelineStages, tagIds, companyIds: scopeCompanyIds(scope) });
            for (const c of matches) {
              if (c.email && !mailableSkipReason(c)) candidates.push({ contactId: c.id, email: c.email.trim() });
            }
          }

          const added = await db.addCrmCampaignRecipients(input.campaignId, candidates);
          await createAuditLog(ctx.user.id, 'update', 'crm_campaign', input.campaignId, `added ${added} recipients`);
          const refreshed = await db.getCrmEmailCampaignById(input.campaignId);
          return { added, alreadyAdded: new Set(candidates.map((c) => c.contactId)).size - added, skipped, totalRecipients: refreshed?.totalRecipients ?? 0 };
        }),

      removeRecipient: internalProcedure
        .input(z.object({ campaignId: z.number(), recipientId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const campaign = await loadScopedCampaign(input.campaignId, await resolveRequestScope(ctx.user));
          if (!RECIPIENT_EDITABLE.includes(campaign.status ?? "draft")) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Recipients cannot be changed while the campaign is ${campaign.status}` });
          }
          if (!(await db.removeCrmCampaignRecipient(input.campaignId, input.recipientId))) {
            throw new TRPCError({ code: "CONFLICT", message: "Recipient not found or already sent" });
          }
          return { success: true };
        }),

      sendTest: campaignSendProcedure
        .input(z.object({ campaignId: z.number(), to: z.string().email() }))
        .mutation(async ({ input, ctx }) => {
          const campaign = await loadScopedCampaign(input.campaignId, await resolveRequestScope(ctx.user));
          // Preview with the first recipient's data when there is one.
          const [first] = await db.getCrmCampaignRecipients(input.campaignId);
          const sample = first ? await db.getCrmContactById(first.contactId) : undefined;
          const [firstName, ...rest] = (ctx.user.name ?? "").split(" ");
          const res = await sendCampaignTest(campaign, input.to, sample ?? { firstName, lastName: rest.join(" "), fullName: ctx.user.name ?? "", email: input.to });
          if (!res.success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: res.error ?? "Test email failed" });
          return { success: true };
        }),

      // Sends now to every pending (and previously failed) recipient. Already
      // sent recipients are never mailed again.
      send: campaignSendProcedure
        .input(z.object({ campaignId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const campaign = await loadScopedCampaign(input.campaignId, await resolveRequestScope(ctx.user));
          if (!SENDABLE.includes(campaign.status ?? "draft") && campaign.status !== "sending") {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Campaign is ${campaign.status}` });
          }
          const recipients = await db.getCrmCampaignRecipients(input.campaignId);
          if (!recipients.some((r) => r.status === "pending" || r.status === "failed")) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No unsent recipients — add recipients first" });
          }
          const result = await sendCampaign(input.campaignId, { fromStatuses: SENDABLE });
          if (!result.claimed) {
            throw new TRPCError({ code: "CONFLICT", message: "Campaign is already being sent" });
          }
          await createAuditLog(ctx.user.id, 'update', 'crm_campaign', input.campaignId, `sent: ${result.sent} ok, ${result.failed} failed, ${result.skipped} skipped`);
          return result;
        }),

      // Queues the campaign for the 5-minute outreach runner.
      schedule: campaignSendProcedure
        .input(z.object({ campaignId: z.number(), scheduledAt: z.date() }))
        .mutation(async ({ input, ctx }) => {
          const campaign = await loadScopedCampaign(input.campaignId, await resolveRequestScope(ctx.user));
          if (!SENDABLE.includes(campaign.status ?? "draft")) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Campaign is ${campaign.status}` });
          }
          if (input.scheduledAt.getTime() < Date.now() - 60_000) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Schedule time is in the past" });
          }
          const recipients = await db.getCrmCampaignRecipients(input.campaignId);
          if (!recipients.some((r) => r.status === "pending" || r.status === "failed")) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No unsent recipients — add recipients first" });
          }
          await db.updateCrmEmailCampaign(input.campaignId, { status: "scheduled", scheduledAt: input.scheduledAt });
          await createAuditLog(ctx.user.id, 'update', 'crm_campaign', input.campaignId, `scheduled for ${input.scheduledAt.toISOString()}`);
          return { success: true, scheduledAt: input.scheduledAt };
        }),

      unschedule: campaignSendProcedure
        .input(z.object({ campaignId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const campaign = await loadScopedCampaign(input.campaignId, await resolveRequestScope(ctx.user));
          if (campaign.status !== "scheduled") {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Campaign is not scheduled" });
          }
          await db.updateCrmEmailCampaign(input.campaignId, { status: "draft", scheduledAt: null });
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
