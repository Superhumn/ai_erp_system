import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { router, protectedProcedure, createAuditLog } from "./middleware";

export const crmRouter = router({
  // ============================================
  // CRM MODULE - Contacts, Messaging & Tracking
  // ============================================
  crm: router({
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

      // Auto-merge every duplicate group, keeping the oldest contact (lowest id)
      // as the primary. Useful for a one-click cleanup of a bloated CRM.
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
        }))
        .mutation(async ({ input, ctx }) => {
          // Create message record (actual sending would be via WhatsApp Business API webhook)
          const id = await db.createWhatsappMessage({
            ...input,
            direction: "outbound",
            status: "pending",
            sentBy: ctx.user.id,
            conversationId: `wa_${input.whatsappNumber}_${Date.now()}`,
          });

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

          return { id, status: "pending" };
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
          name: z.string().min(1),
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
          const id = await db.createCrmDeal({
            ...input,
            assignedTo: input.assignedTo || ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'create', 'crm_deal', id, input.name);
          return { id };
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
          // Check for existing contact by whatsapp/phone (normalized).
          const existing = await db.findCrmContactMatch({
            whatsappNumber: input.whatsappNumber,
            phone: input.whatsappNumber,
          });

          if (existing) {
            // Update WhatsApp number if needed
            if (!existing.whatsappNumber) {
              await db.updateCrmContact(existing.id, { whatsappNumber: input.whatsappNumber });
            }
            return { contactId: existing.id, isNew: false };
          }

          // Create new contact (use findOrCreate for race-safety)
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
  }),
});
