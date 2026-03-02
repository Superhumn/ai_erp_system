/**
 * AI-Driven Vendor Email Automation
 *
 * Handles autonomous vendor communication workflows:
 * - PO follow-up reminders
 * - Quote request emails
 * - Payment reminder emails
 * - Bulk email to selected vendors/customers
 */

import { invokeLLM } from "./_core/llm";
import * as emailService from "./_core/emailService";
import * as db from "./db";

// ─── Types ──────────────────────────────────────────────────────────────

export interface VendorEmailRequest {
  vendorId: number;
  emailType: "po_followup" | "quote_request" | "payment_reminder" | "general" | "order_confirmation" | "shipment_inquiry";
  purchaseOrderId?: number;
  subject?: string;
  customMessage?: string;
  triggeredBy?: number; // User ID
}

export interface BulkEmailRequest {
  recipientType: "vendor" | "customer";
  recipientIds: number[];
  subject: string;
  body: string;
  triggeredBy?: number;
}

export interface EmailAutomationResult {
  success: boolean;
  emailsSent: number;
  emailsFailed: number;
  details: { recipientId: number; recipientName: string; email: string; success: boolean; error?: string }[];
}

// ─── AI Email Generation ────────────────────────────────────────────────

/**
 * Generate a professional vendor email using AI.
 */
export async function generateVendorEmail(request: VendorEmailRequest): Promise<{
  subject: string;
  body: string;
  htmlBody: string;
}> {
  const vendor = await db.getVendorById(request.vendorId);
  if (!vendor) throw new Error("Vendor not found");

  let context = "";
  let defaultSubject = "";

  // Build context based on email type
  switch (request.emailType) {
    case "po_followup": {
      if (request.purchaseOrderId) {
        const po = await db.getPurchaseOrderById(request.purchaseOrderId);
        if (po) {
          const items = await db.getPurchaseOrderItems(request.purchaseOrderId);
          const itemList = items.map(i => `- ${i.description}: qty ${i.quantity} @ $${i.unitPrice}`).join("\n");
          context = `This is a follow-up on Purchase Order ${po.poNumber} (total: $${po.totalAmount}, status: ${po.status}).
Expected delivery: ${po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'Not set'}
Items:\n${itemList}`;
          defaultSubject = `Follow-up: Purchase Order ${po.poNumber}`;
        }
      }
      break;
    }
    case "quote_request": {
      defaultSubject = `Request for Quotation - ${vendor.name}`;
      context = `We need a quote from this vendor. ${request.customMessage || "Please provide pricing and lead times for our required materials."}`;
      break;
    }
    case "payment_reminder": {
      const invoices = await db.getInvoices();
      const vendorInvoices = invoices.filter(
        i => i.vendorId === request.vendorId && ["sent", "overdue"].includes(i.status)
      );
      if (vendorInvoices.length > 0) {
        const invList = vendorInvoices.map(
          i => `- ${i.invoiceNumber}: $${i.totalAmount} (due: ${i.dueDate ? new Date(i.dueDate).toLocaleDateString() : 'N/A'})`
        ).join("\n");
        context = `Outstanding invoices:\n${invList}`;
      }
      defaultSubject = `Payment Status Update - ${vendor.name}`;
      break;
    }
    case "shipment_inquiry": {
      defaultSubject = `Shipment Status Inquiry`;
      context = request.customMessage || "We'd like an update on the shipment status for our recent orders.";
      break;
    }
    default: {
      defaultSubject = request.subject || `Message from our team`;
      context = request.customMessage || "";
    }
  }

  const prompt = `You are a professional procurement manager writing a business email.

RECIPIENT: ${vendor.contactName || vendor.name} at ${vendor.name}
EMAIL TYPE: ${request.emailType.replace(/_/g, " ")}
CONTEXT: ${context}
${request.customMessage ? `ADDITIONAL INSTRUCTIONS: ${request.customMessage}` : ""}

Write a concise, professional email. Return ONLY a JSON object with:
{
  "subject": "email subject line",
  "body": "plain text email body",
  "htmlBody": "HTML formatted email body with proper paragraph tags"
}

Keep the email under 200 words. Be direct and professional. Include a clear call to action.`;

  try {
    const response = await invokeLLM(prompt);
    const parsed = JSON.parse(response);
    return {
      subject: parsed.subject || request.subject || defaultSubject,
      body: parsed.body || "",
      htmlBody: parsed.htmlBody || `<p>${parsed.body || ""}</p>`,
    };
  } catch {
    // Fallback to template-based email
    return {
      subject: request.subject || defaultSubject,
      body: `Dear ${vendor.contactName || vendor.name},\n\n${context}\n\nPlease reply at your earliest convenience.\n\nBest regards`,
      htmlBody: `<p>Dear ${vendor.contactName || vendor.name},</p><p>${context}</p><p>Please reply at your earliest convenience.</p><p>Best regards</p>`,
    };
  }
}

// ─── Send Vendor Email ──────────────────────────────────────────────────

/**
 * Generate and send an AI-crafted email to a vendor.
 */
export async function sendVendorEmail(request: VendorEmailRequest): Promise<{
  success: boolean;
  emailMessageId?: number;
  error?: string;
}> {
  const vendor = await db.getVendorById(request.vendorId);
  if (!vendor?.email) {
    return { success: false, error: "Vendor has no email address" };
  }

  const { subject, htmlBody } = await generateVendorEmail(request);

  const result = await emailService.queueEmail({
    templateName: "GENERAL",
    to: { email: vendor.email, name: vendor.contactName || vendor.name },
    subject,
    payload: { htmlBody, vendorName: vendor.name },
    relatedEntityType: request.purchaseOrderId ? "purchase_order" : "vendor",
    relatedEntityId: request.purchaseOrderId || request.vendorId,
    triggeredBy: request.triggeredBy,
    aiGenerated: true,
  });

  return {
    success: result.success,
    emailMessageId: result.emailMessageId,
    error: result.error,
  };
}

// ─── Bulk Email ─────────────────────────────────────────────────────────

/**
 * Send a templated email to multiple vendors or customers.
 */
export async function sendBulkEmail(request: BulkEmailRequest): Promise<EmailAutomationResult> {
  const details: EmailAutomationResult["details"] = [];
  let sent = 0;
  let failed = 0;

  for (const recipientId of request.recipientIds) {
    let name = "";
    let email = "";

    if (request.recipientType === "vendor") {
      const vendor = await db.getVendorById(recipientId);
      if (!vendor?.email) {
        details.push({ recipientId, recipientName: vendor?.name || "Unknown", email: "", success: false, error: "No email" });
        failed++;
        continue;
      }
      name = vendor.contactName || vendor.name;
      email = vendor.email;
    } else {
      const customer = await db.getCustomerById(recipientId);
      if (!customer?.email) {
        details.push({ recipientId, recipientName: customer?.name || "Unknown", email: "", success: false, error: "No email" });
        failed++;
        continue;
      }
      name = customer.name;
      email = customer.email;
    }

    // Personalize body with recipient name
    const personalizedBody = request.body.replace(/\{name\}/gi, name);

    const result = await emailService.queueEmail({
      templateName: "GENERAL",
      to: { email, name },
      subject: request.subject,
      payload: { htmlBody: personalizedBody, recipientName: name },
      relatedEntityType: request.recipientType,
      relatedEntityId: recipientId,
      triggeredBy: request.triggeredBy,
    });

    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    details.push({
      recipientId,
      recipientName: name,
      email,
      success: result.success,
      error: result.error,
    });
  }

  return { success: failed === 0, emailsSent: sent, emailsFailed: failed, details };
}

// ─── Auto Follow-up Checker ────────────────────────────────────────────

/**
 * Check for POs that need follow-up and queue reminder emails.
 */
export async function checkAndSendPoFollowups(triggeredBy?: number): Promise<{
  followUpsSent: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let followUpsSent = 0;

  // Get POs that are sent or confirmed but past expected date
  const sentPOs = await db.getPurchaseOrders({ status: "sent" });
  const confirmedPOs = await db.getPurchaseOrders({ status: "confirmed" });
  const allOpenPOs = [...sentPOs, ...confirmedPOs];
  const now = new Date();

  for (const po of allOpenPOs) {
    if (!po.expectedDate) continue;
    const expected = new Date(po.expectedDate);
    const daysOverdue = Math.floor((now.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24));

    // Send follow-up if 3+ days overdue
    if (daysOverdue >= 3 && po.vendorId) {
      try {
        await sendVendorEmail({
          vendorId: po.vendorId,
          emailType: "po_followup",
          purchaseOrderId: po.id,
          triggeredBy,
        });
        followUpsSent++;
      } catch (err) {
        errors.push(`Failed to send follow-up for PO ${po.poNumber}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  }

  return { followUpsSent, errors };
}
