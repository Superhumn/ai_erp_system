import { getDb } from "../../../db";
import { sendEmail, isEmailConfigured, formatEmailHtml } from "../../../_core/email";
import { invokeLLM } from "../../../_core/llm";
import {
  sentEmails,
  crmInteractions,
  crmContacts,
  customers,
  vendors,
} from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { ToolAdapterResult } from "../../types";

interface SendEmailInput {
  action: string;
  payload?: {
    contactType?: "vendor" | "customer" | "crm_contact";
    contactId?: number;
    to?: string;
    subject?: string;
    body?: string;
    generateWithAI?: boolean;
    purpose?: string;
    replyToEmailId?: number;
  };
}

/**
 * Email communication adapter — allows the agent to compose and send emails
 * to contacts, vendors, or customers, and records all interactions in the CRM.
 */
export async function runEmailCommunication(input: SendEmailInput): Promise<ToolAdapterResult> {
  const db = await getDb();
  if (!db) throw new Error("Database connection unavailable");
  const { action, payload } = input;

  switch (action) {
    case "send_email": {
      if (!payload) return { success: false, error: "payload is required" };

      const { contactType, contactId, to, subject, body, generateWithAI, purpose } = payload;

      // Resolve recipient
      let recipientEmail = to;
      let recipientName = "";
      let resolvedContactId: number | undefined;

      if (contactType && contactId) {
        const resolved = await resolveContact(db, contactType, contactId);
        if (!resolved.success) return resolved;
        recipientEmail = (resolved.data as any).email;
        recipientName = (resolved.data as any).name;
        resolvedContactId = (resolved.data as any).crmContactId;
      }

      if (!recipientEmail) {
        return { success: false, error: "No email address found for recipient. Provide 'to' or a valid contactType+contactId." };
      }

      let emailSubject = subject ?? "";
      let emailBody = body ?? "";

      // Generate email content with AI if requested
      if (generateWithAI && purpose) {
        const generated = await generateEmailContent(purpose, recipientName, recipientEmail);
        emailSubject = emailSubject || generated.subject;
        emailBody = emailBody || generated.body;
      }

      if (!emailSubject || !emailBody) {
        return { success: false, error: "subject and body are required (or set generateWithAI: true with a purpose)" };
      }

      // Send the email
      if (!isEmailConfigured()) {
        return { success: false, error: "Email service not configured (SendGrid API key missing)" };
      }

      const htmlBody = formatEmailHtml(emailBody);
      const result = await sendEmail({
        to: recipientEmail,
        subject: emailSubject,
        text: emailBody,
        html: htmlBody,
      });

      if (!result.success) {
        return { success: false, error: `Failed to send email: ${result.error}` };
      }

      // Record in sentEmails
      const [sentRecord] = await db.insert(sentEmails).values({
        toEmail: recipientEmail,
        toName: recipientName,
        fromEmail: "",
        subject: emailSubject,
        bodyHtml: htmlBody,
        bodyText: emailBody,
        status: "sent",
        sentAt: new Date(),
        messageId: result.messageId,
        aiGenerated: !!generateWithAI,
      }).$returningId();

      // Record CRM interaction if we have a contact
      if (resolvedContactId) {
        await db.insert(crmInteractions).values({
          contactId: resolvedContactId,
          channel: "email",
          interactionType: "sent",
          subject: emailSubject,
          content: emailBody,
          emailId: sentRecord.id,
        });

        // Update lastContactedAt
        await db.update(crmContacts)
          .set({ lastContactedAt: new Date() })
          .where(eq(crmContacts.id, resolvedContactId));
      }

      return {
        success: true,
        data: {
          emailId: sentRecord.id,
          to: recipientEmail,
          subject: emailSubject,
          messageId: result.messageId,
          crmInteractionRecorded: !!resolvedContactId,
        },
      };
    }

    case "get_email_history": {
      if (!payload?.contactType || !payload?.contactId) {
        return { success: false, error: "contactType and contactId are required" };
      }

      const resolved = await resolveContact(db, payload.contactType, payload.contactId);
      if (!resolved.success) return resolved;

      if (!(resolved.data as any).crmContactId) {
        return { success: true, data: { interactions: [], message: "No CRM contact linked" } };
      }

      const interactions = await db
        .select()
        .from(crmInteractions)
        .where(eq(crmInteractions.contactId, (resolved.data as any).crmContactId))
        .limit(50);

      return {
        success: true,
        data: {
          contact: { name: (resolved.data as any).name, email: (resolved.data as any).email },
          interactions,
          count: interactions.length,
        },
      };
    }

    default:
      return { success: false, error: `Unknown email action: ${action}` };
  }
}

/**
 * Resolves a contact's email and name from the given entity type.
 * Also finds or creates a CRM contact for interaction tracking.
 */
async function resolveContact(
  db: any,
  contactType: string,
  contactId: number,
): Promise<ToolAdapterResult> {
  let email = "";
  let name = "";
  let phone = "";
  let crmContactId: number | undefined;

  switch (contactType) {
    case "vendor": {
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, contactId));
      if (!vendor) return { success: false, error: `Vendor ${contactId} not found` };
      email = vendor.email ?? "";
      name = vendor.contactName ?? vendor.name;
      phone = vendor.phone ?? "";
      break;
    }
    case "customer": {
      const [customer] = await db.select().from(customers).where(eq(customers.id, contactId));
      if (!customer) return { success: false, error: `Customer ${contactId} not found` };
      email = customer.email ?? "";
      name = customer.name;
      phone = customer.phone ?? "";
      break;
    }
    case "crm_contact": {
      const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId));
      if (!contact) return { success: false, error: `CRM contact ${contactId} not found` };
      email = contact.email ?? "";
      name = contact.fullName;
      phone = contact.phone ?? "";
      crmContactId = contact.id;
      break;
    }
    default:
      return { success: false, error: `Unknown contactType: ${contactType}` };
  }

  // Find or link to CRM contact if not already resolved
  if (!crmContactId && email) {
    const [existing] = await db
      .select()
      .from(crmContacts)
      .where(eq(crmContacts.email, email))
      .limit(1);

    if (existing) {
      crmContactId = existing.id;
    } else {
      // Auto-create a CRM contact for unified tracking
      const [created] = await db.insert(crmContacts).values({
        firstName: name.split(" ")[0] || name,
        lastName: name.split(" ").slice(1).join(" ") || undefined,
        fullName: name,
        email,
        phone: phone || undefined,
        contactType: contactType === "vendor" ? "vendor" : "customer",
        source: "manual",
        customerId: contactType === "customer" ? contactId : undefined,
      }).$returningId();
      crmContactId = created.id;
    }
  }

  return {
    success: true,
    data: { email, name, phone, crmContactId },
  };
}

/**
 * Uses the existing LLM to generate professional email content.
 */
async function generateEmailContent(
  purpose: string,
  recipientName: string,
  recipientEmail: string,
): Promise<{ subject: string; body: string }> {
  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "user",
          content: `Generate a professional business email.

Purpose: ${purpose}
Recipient name: ${recipientName || "the recipient"}
Recipient email: ${recipientEmail}

Respond in JSON format: { "subject": "...", "body": "..." }
The body should be plain text (no HTML). Keep it concise and professional.`,
        },
      ],
      maxTokens: 500,
    });

    const text = typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content
      : "";

    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
    return { subject: parsed.subject ?? "Follow Up", body: parsed.body ?? "" };
  } catch {
    return { subject: `Re: ${purpose}`, body: `Hi ${recipientName || "there"},\n\nFollowing up regarding: ${purpose}\n\nPlease let us know if you have any questions.\n\nBest regards` };
  }
}
