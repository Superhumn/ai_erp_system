import twilio from "twilio";
import { getDb } from "../../../db";
import { ENV } from "../../../_core/env";
import {
  agentSmsLogs,
  crmInteractions,
  crmContacts,
  customers,
  vendors,
} from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { ToolAdapterResult } from "../../types";

interface SmsInput {
  action: string;
  payload?: {
    contactType?: "vendor" | "customer" | "crm_contact";
    contactId?: number;
    phoneNumber?: string;
    body?: string;
    purpose?: string;
    messageSid?: string;
  };
}

const MAX_BODY_LENGTH = 1600;

function getTwilioClient() {
  if (!ENV.twilioAccountSid || !ENV.twilioAuthToken) {
    return null;
  }
  return twilio(ENV.twilioAccountSid, ENV.twilioAuthToken);
}

/**
 * SMS adapter — lets the agent send and track text messages via Twilio,
 * log manual texts, and record outcomes in the CRM interaction history.
 */
export async function runSmsCommunication(input: SmsInput): Promise<ToolAdapterResult> {
  const db = await getDb();
  if (!db) throw new Error("Database connection unavailable");
  const { action, payload } = input;

  switch (action) {
    case "send_sms": {
      if (!payload) return { success: false, error: "payload is required" };

      const client = getTwilioClient();
      if (!client) {
        return { success: false, error: "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER." };
      }
      if (!ENV.twilioPhoneNumber) {
        return { success: false, error: "TWILIO_PHONE_NUMBER not configured." };
      }

      const { contactType, contactId, phoneNumber, body, purpose } = payload;
      if (!body || !body.trim()) {
        return { success: false, error: "body is required" };
      }
      if (body.length > MAX_BODY_LENGTH) {
        return { success: false, error: `body exceeds ${MAX_BODY_LENGTH} character limit` };
      }

      let resolvedPhone = phoneNumber;
      let contactName = "";
      const resolvedContactType = contactType;
      const resolvedContactId = contactId;

      if (contactType && contactId) {
        const resolved = await resolveContactPhone(db, contactType, contactId);
        if (!resolved.success) return resolved;
        resolvedPhone = resolvedPhone || (resolved.data as any).phone;
        contactName = (resolved.data as any).name;
        if ((resolved.data as any).optedOutSms) {
          return { success: false, error: `Contact has opted out of SMS communications` };
        }
      }

      if (!resolvedPhone) {
        return { success: false, error: "No phone number found. Provide phoneNumber or a valid contactType+contactId with a phone on file." };
      }

      const [smsLog] = await db.insert(agentSmsLogs).values({
        contactType: resolvedContactType ?? "crm_contact",
        contactId: resolvedContactId ?? 0,
        contactName,
        phoneNumber: resolvedPhone,
        direction: "outbound",
        status: "queued",
        body,
        purpose: purpose || undefined,
      }).$returningId();

      try {
        const message = await client.messages.create({
          to: resolvedPhone,
          from: ENV.twilioPhoneNumber,
          body,
          statusCallback: `${ENV.publicAppUrl}/api/twilio/sms-status`,
        });

        await db.update(agentSmsLogs)
          .set({
            twilioMessageSid: message.sid,
            status: mapTwilioSmsStatus(message.status) ?? "sending",
            numSegments: message.numSegments ? Number(message.numSegments) : undefined,
          })
          .where(eq(agentSmsLogs.id, smsLog.id));

        const crmContactId = await findOrCreateCrmContact(db, contactType, contactId, contactName, resolvedPhone);
        if (crmContactId) {
          const [interaction] = await db.insert(crmInteractions).values({
            contactId: crmContactId,
            channel: "sms",
            interactionType: "sent",
            subject: purpose || "Outbound SMS",
            content: body,
          }).$returningId();

          await db.update(agentSmsLogs)
            .set({ crmInteractionId: interaction.id })
            .where(eq(agentSmsLogs.id, smsLog.id));

          await db.update(crmContacts)
            .set({ lastContactedAt: new Date() })
            .where(eq(crmContacts.id, crmContactId));
        }

        return {
          success: true,
          data: {
            smsLogId: smsLog.id,
            messageSid: message.sid,
            status: message.status,
            to: resolvedPhone,
            contactName,
            numSegments: message.numSegments,
            crmInteractionRecorded: !!crmContactId,
          },
        };
      } catch (err) {
        const e = err as { message: string; code?: string };
        await db.update(agentSmsLogs)
          .set({ status: "failed", errorMessage: e.message, errorCode: e.code })
          .where(eq(agentSmsLogs.id, smsLog.id));

        return { success: false, error: `SMS send failed: ${e.message}` };
      }
    }

    case "log_sms": {
      if (!payload) return { success: false, error: "payload is required" };

      const { contactType, contactId, phoneNumber, body, purpose } = payload;
      if (!contactType || !contactId) {
        return { success: false, error: "contactType and contactId are required for logging an SMS" };
      }
      if (!body || !body.trim()) {
        return { success: false, error: "body is required" };
      }

      const resolved = await resolveContactPhone(db, contactType, contactId);
      const phone = phoneNumber || (resolved.data as any)?.phone || "unknown";

      const [smsLog] = await db.insert(agentSmsLogs).values({
        contactType,
        contactId,
        contactName: (resolved.data as any)?.name || "",
        phoneNumber: phone,
        direction: "outbound",
        status: "sent",
        body,
        purpose: purpose || undefined,
      }).$returningId();

      const crmContactId = await findOrCreateCrmContact(db, contactType, contactId, (resolved.data as any)?.name, phone);
      if (crmContactId) {
        await db.insert(crmInteractions).values({
          contactId: crmContactId,
          channel: "sms",
          interactionType: "sent",
          subject: purpose || "Logged SMS",
          content: body,
        });
      }

      return {
        success: true,
        data: { smsLogId: smsLog.id, logged: true, crmInteractionRecorded: !!crmContactId },
      };
    }

    case "get_sms_status": {
      const messageSid = payload?.messageSid;
      if (!messageSid) return { success: false, error: "messageSid is required" };

      const client = getTwilioClient();
      if (!client) return { success: false, error: "Twilio not configured" };

      try {
        const message = await client.messages(messageSid).fetch();
        return {
          success: true,
          data: {
            sid: message.sid,
            status: message.status,
            to: message.to,
            from: message.from,
            body: message.body,
            numSegments: message.numSegments,
            errorCode: message.errorCode,
            errorMessage: message.errorMessage,
            dateSent: message.dateSent,
            dateUpdated: message.dateUpdated,
          },
        };
      } catch (err) {
        return { success: false, error: `Failed to fetch SMS status: ${(err as Error).message}` };
      }
    }

    default:
      return { success: false, error: `Unknown SMS action: ${action}` };
  }
}

export function mapTwilioSmsStatus(status: string | null | undefined):
  | "queued" | "sending" | "sent" | "delivered" | "undelivered" | "failed" | "received" | null {
  if (!status) return null;
  switch (status) {
    case "accepted":
    case "scheduled":
    case "queued":
      return "queued";
    case "sending":
      return "sending";
    case "sent":
      return "sent";
    case "delivered":
    case "read":
      return "delivered";
    case "undelivered":
      return "undelivered";
    case "failed":
    case "canceled":
      return "failed";
    case "received":
      return "received";
    default:
      return null;
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
      return {
        success: true,
        data: {
          phone: contact.phone ?? "",
          name: contact.fullName,
          email: contact.email,
          optedOutSms: contact.optedOutSms ?? false,
        },
      };
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

  if (phone) {
    const [existing] = await db.select().from(crmContacts).where(eq(crmContacts.phone, phone)).limit(1);
    if (existing) return existing.id;
  }

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
