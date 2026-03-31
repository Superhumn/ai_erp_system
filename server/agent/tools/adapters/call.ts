import twilio from "twilio";
import { getDb } from "../../../db";
import { ENV } from "../../../_core/env";
import { invokeLLM } from "../../../_core/llm";
import {
  agentCallLogs,
  crmInteractions,
  crmContacts,
  customers,
  vendors,
} from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { ToolAdapterResult } from "../../types";

interface CallInput {
  action: string;
  payload?: {
    contactType?: "vendor" | "customer" | "crm_contact";
    contactId?: number;
    phoneNumber?: string;
    purpose?: string;
    twimlMessage?: string;
    callSid?: string;
  };
}

function getTwilioClient() {
  if (!ENV.twilioAccountSid || !ENV.twilioAuthToken) {
    return null;
  }
  return twilio(ENV.twilioAccountSid, ENV.twilioAuthToken);
}

/**
 * Phone call adapter — allows the agent to initiate calls via Twilio,
 * log call outcomes, and record all interactions in the CRM.
 */
export async function runPhoneCall(input: CallInput): Promise<ToolAdapterResult> {
  const db = await getDb();
  const { action, payload } = input;

  switch (action) {
    case "make_call": {
      if (!payload) return { success: false, error: "payload is required" };

      const client = getTwilioClient();
      if (!client) {
        return { success: false, error: "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER." };
      }
      if (!ENV.twilioPhoneNumber) {
        return { success: false, error: "TWILIO_PHONE_NUMBER not configured." };
      }

      const { contactType, contactId, phoneNumber, purpose, twimlMessage } = payload;

      // Resolve phone number
      let resolvedPhone = phoneNumber;
      let contactName = "";
      let resolvedContactType = contactType;
      let resolvedContactId = contactId;

      if (contactType && contactId) {
        const resolved = await resolveContactPhone(db, contactType, contactId);
        if (!resolved.success) return resolved;
        resolvedPhone = resolvedPhone || resolved.data.phone;
        contactName = resolved.data.name;
      }

      if (!resolvedPhone) {
        return { success: false, error: "No phone number found. Provide phoneNumber or a valid contactType+contactId with a phone on file." };
      }

      // Build TwiML for the call
      const message = twimlMessage || `Hello, this is a call from Superhumn ERP regarding: ${purpose || "a business matter"}. Please hold for an agent.`;
      const twiml = `<Response><Say voice="Polly.Amy">${escapeXml(message)}</Say><Pause length="2"/><Say voice="Polly.Amy">Thank you. Goodbye.</Say></Response>`;

      // Create call log first
      const [callLog] = await db.insert(agentCallLogs).values({
        contactType: resolvedContactType ?? "crm_contact",
        contactId: resolvedContactId ?? 0,
        contactName,
        phoneNumber: resolvedPhone,
        direction: "outbound",
        status: "initiated",
        purpose: purpose || undefined,
        companyId: undefined,
      }).$returningId();

      try {
        const call = await client.calls.create({
          to: resolvedPhone,
          from: ENV.twilioPhoneNumber,
          twiml,
          record: true,
          statusCallback: `${ENV.publicAppUrl}/api/twilio/call-status`,
        });

        // Update with Twilio SID
        await db.update(agentCallLogs)
          .set({ twilioCallSid: call.sid, status: "ringing" })
          .where(eq(agentCallLogs.id, callLog.id));

        // Record CRM interaction
        const crmContactId = await findOrCreateCrmContact(db, contactType, contactId, contactName, resolvedPhone);
        if (crmContactId) {
          const [interaction] = await db.insert(crmInteractions).values({
            contactId: crmContactId,
            channel: "phone",
            interactionType: "call_made",
            subject: purpose || "Outbound call",
            content: `Call initiated to ${resolvedPhone}. Purpose: ${purpose || "N/A"}`,
          }).$returningId();

          await db.update(agentCallLogs)
            .set({ crmInteractionId: interaction.id })
            .where(eq(agentCallLogs.id, callLog.id));

          await db.update(crmContacts)
            .set({ lastContactedAt: new Date() })
            .where(eq(crmContacts.id, crmContactId));
        }

        return {
          success: true,
          data: {
            callLogId: callLog.id,
            callSid: call.sid,
            status: call.status,
            to: resolvedPhone,
            contactName,
            crmInteractionRecorded: !!crmContactId,
          },
        };
      } catch (err) {
        await db.update(agentCallLogs)
          .set({ status: "failed" })
          .where(eq(agentCallLogs.id, callLog.id));

        return { success: false, error: `Call failed: ${(err as Error).message}` };
      }
    }

    case "log_call": {
      if (!payload) return { success: false, error: "payload is required" };

      const { contactType, contactId, phoneNumber, purpose } = payload;
      if (!contactType || !contactId) {
        return { success: false, error: "contactType and contactId are required for logging a call" };
      }

      const resolved = await resolveContactPhone(db, contactType, contactId);
      const phone = phoneNumber || resolved.data?.phone || "unknown";

      const [callLog] = await db.insert(agentCallLogs).values({
        contactType,
        contactId,
        contactName: resolved.data?.name || "",
        phoneNumber: phone,
        direction: "outbound",
        status: "completed",
        purpose: purpose || undefined,
      }).$returningId();

      const crmContactId = await findOrCreateCrmContact(db, contactType, contactId, resolved.data?.name, phone);
      if (crmContactId) {
        await db.insert(crmInteractions).values({
          contactId: crmContactId,
          channel: "phone",
          interactionType: "call_made",
          subject: purpose || "Logged call",
          content: `Call logged to ${phone}. Purpose: ${purpose || "N/A"}`,
          callOutcome: "answered",
        });
      }

      return {
        success: true,
        data: { callLogId: callLog.id, logged: true, crmInteractionRecorded: !!crmContactId },
      };
    }

    case "get_call_status": {
      const callSid = payload?.callSid;
      if (!callSid) return { success: false, error: "callSid is required" };

      const client = getTwilioClient();
      if (!client) return { success: false, error: "Twilio not configured" };

      try {
        const call = await client.calls(callSid).fetch();
        return {
          success: true,
          data: {
            sid: call.sid,
            status: call.status,
            duration: call.duration,
            to: call.to,
            from: call.from,
            startTime: call.startTime,
            endTime: call.endTime,
          },
        };
      } catch (err) {
        return { success: false, error: `Failed to fetch call status: ${(err as Error).message}` };
      }
    }

    default:
      return { success: false, error: `Unknown call action: ${action}` };
  }
}

async function resolveContactPhone(db: any, contactType: string, contactId: number): Promise<ToolAdapterResult> {
  switch (contactType) {
    case "vendor": {
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, contactId));
      if (!vendor) return { success: false, error: `Vendor ${contactId} not found` };
      return { success: true, data: { phone: vendor.phone ?? "", name: vendor.contactName ?? vendor.name, email: vendor.email } };
    }
    case "customer": {
      const [customer] = await db.select().from(customers).where(eq(customers.id, contactId));
      if (!customer) return { success: false, error: `Customer ${contactId} not found` };
      return { success: true, data: { phone: customer.phone ?? "", name: customer.name, email: customer.email } };
    }
    case "crm_contact": {
      const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId));
      if (!contact) return { success: false, error: `CRM contact ${contactId} not found` };
      return { success: true, data: { phone: contact.phone ?? "", name: contact.fullName, email: contact.email } };
    }
    default:
      return { success: false, error: `Unknown contactType: ${contactType}` };
  }
}

async function findOrCreateCrmContact(
  db: any,
  contactType: string | undefined,
  contactId: number | undefined,
  name: string | undefined,
  phone: string,
): Promise<number | undefined> {
  if (!contactType || !contactId) return undefined;

  // Try to find existing CRM contact by phone
  if (phone) {
    const [existing] = await db.select().from(crmContacts).where(eq(crmContacts.phone, phone)).limit(1);
    if (existing) return existing.id;
  }

  // Create new CRM contact
  if (name) {
    const [created] = await db.insert(crmContacts).values({
      firstName: name.split(" ")[0] || name,
      lastName: name.split(" ").slice(1).join(" ") || undefined,
      fullName: name,
      phone: phone || undefined,
      contactType: contactType === "vendor" ? "vendor" : "customer",
      source: "manual",
    }).$returningId();
    return created.id;
  }

  return undefined;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
