/**
 * Transactional Email Service
 *
 * Handles queuing, sending, and tracking of transactional emails
 * using SendGrid dynamic templates.
 */

import { ENV } from "./env";
import * as sendgrid from "./sendgridProvider";
import * as db from "../db";
import * as emailTracking from "../emailTrackingService";

// Template name type matching the schema enum
export type TemplateName =
  | "QUOTE"
  | "PO"
  | "SHIPMENT"
  | "ALERT"
  | "RFQ"
  | "INVOICE"
  | "PAYMENT_REMINDER"
  | "WELCOME"
  | "GENERAL";

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface QueueEmailOptions {
  templateName: TemplateName;
  to: EmailRecipient;
  subject: string;
  payload: Record<string, any>;
  idempotencyKey?: string;
  relatedEntityType?: string;
  relatedEntityId?: number;
  triggeredBy?: number; // User ID
  aiGenerated?: boolean;
  scheduledAt?: Date;
}

export interface QueueEmailResult {
  success: boolean;
  emailMessageId?: number;
  error?: string;
  isDuplicate?: boolean;
}

export interface SendEmailResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  shouldRetry?: boolean;
}

/**
 * Queue an email for sending
 * Creates an EmailMessage record with status=queued
 */
export async function queueEmail(options: QueueEmailOptions): Promise<QueueEmailResult> {
  try {
    // Check if recipient is on bounce/suppression list
    const eligibility = await emailTracking.checkSendEligibility(options.to.email);
    if (!eligibility.canSend) {
      console.log(`[EmailService] Skipping suppressed recipient: ${options.to.email} - ${eligibility.reason}`);
      return { success: false, error: eligibility.reason };
    }

    // Check for duplicate using idempotency key
    if (options.idempotencyKey) {
      const existing = await db.getEmailMessageByIdempotencyKey(options.idempotencyKey);
      if (existing) {
        console.log(`[EmailService] Duplicate email detected: ${options.idempotencyKey}`);
        return {
          success: true,
          emailMessageId: existing.id,
          isDuplicate: true,
        };
      }
    }

    // Create the email message record
    const result = await db.createEmailMessage({
      toEmail: options.to.email,
      toName: options.to.name,
      fromEmail: ENV.sendgridFromEmail,
      fromName: "ERP System", // Can be customized
      replyTo: ENV.sendgridReplyTo || undefined,
      subject: options.subject,
      templateName: options.templateName as any,
      payloadJson: options.payload,
      idempotencyKey: options.idempotencyKey,
      status: "queued" as any,
      relatedEntityType: options.relatedEntityType,
      relatedEntityId: options.relatedEntityId,
      triggeredBy: options.triggeredBy,
      aiGenerated: options.aiGenerated || false,
      scheduledAt: options.scheduledAt,
    });

    console.log(`[EmailService] Queued email ${result.id} for ${options.to.email}`);

    return {
      success: true,
      emailMessageId: result.id,
    };
  } catch (error: any) {
    console.error("[EmailService] Failed to queue email:", error);
    return {
      success: false,
      error: error.message || "Failed to queue email",
    };
  }
}

/**
 * Send a queued email by its ID
 */
export async function sendQueuedEmail(emailMessageId: number): Promise<SendEmailResult> {
  try {
    // Get the email message
    const message = await db.getEmailMessageById(emailMessageId);
    if (!message) {
      return {
        success: false,
        error: "Email message not found",
        shouldRetry: false,
      };
    }

    // Check if already sent
    if (message.status !== "queued" && message.status !== "sending") {
      return {
        success: false,
        error: `Email already processed with status: ${message.status}`,
        shouldRetry: false,
      };
    }

    // Update status to sending
    await db.updateEmailMessageStatus(emailMessageId, "sending");

    // Get the template
    const template = await db.getTransactionalEmailTemplateByName(message.templateName);
    if (!template) {
      await db.updateEmailMessageStatus(emailMessageId, "failed", undefined, {
        message: `Template ${message.templateName} not found`,
        code: "TEMPLATE_NOT_FOUND",
      });
      return {
        success: false,
        error: `Template ${message.templateName} not found`,
        shouldRetry: false,
      };
    }

    if (!template.isActive) {
      await db.updateEmailMessageStatus(emailMessageId, "failed", undefined, {
        message: `Template ${message.templateName} is not active`,
        code: "TEMPLATE_INACTIVE",
      });
      return {
        success: false,
        error: `Template ${message.templateName} is not active`,
        shouldRetry: false,
      };
    }

    // Build dynamic template data
    const dynamicTemplateData = {
      ...(message.payloadJson as Record<string, any> || {}),
      // Add common variables
      app_url: ENV.publicAppUrl,
      current_year: new Date().getFullYear(),
    };

    // Send via SendGrid
    const sendResult = await sendgrid.sendWithTemplate({
      templateId: template.providerTemplateId,
      to: {
        email: message.toEmail,
        name: message.toName || undefined,
      },
      from: {
        email: message.fromEmail,
        name: message.fromName || undefined,
      },
      replyTo: message.replyTo ? { email: message.replyTo } : undefined,
      subject: message.subject,
      dynamicTemplateData,
      customArgs: {
        email_message_id: String(emailMessageId),
      },
    });

    if (sendResult.success) {
      await db.updateEmailMessageStatus(
        emailMessageId,
        "sent",
        sendResult.providerMessageId
      );

      console.log(`[EmailService] Sent email ${emailMessageId} - Provider ID: ${sendResult.providerMessageId}`);

      return {
        success: true,
        providerMessageId: sendResult.providerMessageId,
      };
    } else {
      // Handle failure
      if (sendResult.error?.isTransient) {
        // Transient error - increment retry and keep as queued
        await db.incrementEmailMessageRetry(emailMessageId);
        await db.updateEmailMessage(emailMessageId, {
          errorJson: sendResult.error,
        });

        return {
          success: false,
          error: sendResult.error.message,
          shouldRetry: true,
        };
      } else {
        // Permanent error - mark as failed
        await db.updateEmailMessageStatus(emailMessageId, "failed", undefined, sendResult.error);

        return {
          success: false,
          error: sendResult.error?.message || "Unknown error",
          shouldRetry: false,
        };
      }
    }
  } catch (error: any) {
    console.error(`[EmailService] Error sending email ${emailMessageId}:`, error);

    // Try to update status
    try {
      await db.incrementEmailMessageRetry(emailMessageId);
    } catch (e) {
      console.error("[EmailService] Failed to update retry count:", e);
    }

    return {
      success: false,
      error: error.message || "Unknown error",
      shouldRetry: true,
    };
  }
}

/**
 * Send a Quote email
 */
export async function sendQuoteEmail(
  quoteId: number,
  options?: {
    triggeredBy?: number;
    customSubject?: string;
    customPayload?: Record<string, any>;
  }
): Promise<QueueEmailResult> {
  try {
    // Get quote with line items
    const quote = await db.getVendorQuoteById(quoteId);
    if (!quote) {
      return { success: false, error: "Quote not found" };
    }

    // Get related RFQ for more details
    const rfq = quote.rfqId ? await db.getVendorRfqById(quote.rfqId) : null;

    // Get vendor info
    const vendor = await db.getVendorById(quote.vendorId);
    if (!vendor || !vendor.email) {
      return { success: false, error: "Vendor email not found" };
    }

    // Build payload for template
    const payload = {
      quote_number: quote.quoteNumber || `Q-${quote.id}`,
      vendor_name: vendor.name,
      material_name: rfq?.materialName || "N/A",
      quantity: rfq?.quantity || quote.quantity,
      unit: rfq?.unit || "",
      unit_price: quote.unitPrice,
      total_price: quote.totalPrice || quote.totalWithCharges,
      currency: quote.currency || "USD",
      valid_until: quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : "N/A",
      lead_time_days: quote.leadTimeDays,
      payment_terms: quote.paymentTerms,
      view_quote_url: `${ENV.publicAppUrl}/quotes/${quoteId}`,
      ...options?.customPayload,
    };

    // Generate idempotency key
    const idempotencyKey = `quote-${quoteId}-${Date.now()}`;

    return await queueEmail({
      templateName: "QUOTE",
      to: { email: vendor.email, name: vendor.name },
      subject: options?.customSubject || `Quote ${payload.quote_number} for ${payload.material_name}`,
      payload,
      idempotencyKey,
      relatedEntityType: "vendor_quote",
      relatedEntityId: quoteId,
      triggeredBy: options?.triggeredBy,
    });
  } catch (error: any) {
    console.error(`[EmailService] Error sending quote email for ${quoteId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a Purchase Order email
 */
export async function sendPOEmail(
  poId: number,
  options?: {
    triggeredBy?: number;
    customSubject?: string;
    customPayload?: Record<string, any>;
    pdfUrl?: string;
  }
): Promise<QueueEmailResult> {
  try {
    // Get PO with items
    const po = await db.getPurchaseOrderById(poId);
    if (!po) {
      return { success: false, error: "Purchase order not found" };
    }

    // Get vendor info
    const vendor = await db.getVendorById(po.vendorId);
    if (!vendor || !vendor.email) {
      return { success: false, error: "Vendor email not found" };
    }

    // Get line items
    const items = await db.getPurchaseOrderItems(poId);

    // Build payload for template
    const payload = {
      po_number: po.poNumber,
      vendor_name: vendor.name,
      order_date: new Date(po.orderDate).toLocaleDateString(),
      expected_date: po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : "TBD",
      shipping_address: po.shippingAddress,
      subtotal: po.subtotal,
      tax_amount: po.taxAmount,
      shipping_amount: po.shippingAmount,
      total_amount: po.totalAmount,
      currency: po.currency || "USD",
      notes: po.notes,
      line_items: items.map((item, index) => ({
        line_number: index + 1,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total: item.totalAmount,
      })),
      view_po_url: `${ENV.publicAppUrl}/purchase-orders/${poId}`,
      pdf_url: options?.pdfUrl,
      ...options?.customPayload,
    };

    // Generate idempotency key
    const idempotencyKey = `po-${poId}-${po.status}-${Date.now()}`;

    return await queueEmail({
      templateName: "PO",
      to: { email: vendor.email, name: vendor.name },
      subject: options?.customSubject || `Purchase Order ${po.poNumber}`,
      payload,
      idempotencyKey,
      relatedEntityType: "purchase_order",
      relatedEntityId: poId,
      triggeredBy: options?.triggeredBy,
    });
  } catch (error: any) {
    console.error(`[EmailService] Error sending PO email for ${poId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a Shipment notification email
 */
export async function sendShipmentEmail(
  shipmentId: number,
  options?: {
    triggeredBy?: number;
    customSubject?: string;
    customPayload?: Record<string, any>;
    recipientEmail?: string;
    recipientName?: string;
  }
): Promise<QueueEmailResult> {
  try {
    // Get shipment
    const shipment = await db.getShipmentById(shipmentId);
    if (!shipment) {
      return { success: false, error: "Shipment not found" };
    }

    // Determine recipient - either from options or from related order/PO
    let recipientEmail = options?.recipientEmail;
    let recipientName = options?.recipientName;

    if (!recipientEmail) {
      // Try to get from related PO or order
      if (shipment.purchaseOrderId) {
        const po = await db.getPurchaseOrderById(shipment.purchaseOrderId);
        if (po) {
          const vendor = await db.getVendorById(po.vendorId);
          if (vendor?.email) {
            recipientEmail = vendor.email;
            recipientName = vendor.name;
          }
        }
      } else if (shipment.orderId) {
        const order = await db.getOrderById(shipment.orderId);
        if (order) {
          const customer = await db.getCustomerById(order.customerId);
          if (customer?.email) {
            recipientEmail = customer.email;
            recipientName = customer.name;
          }
        }
      }
    }

    if (!recipientEmail) {
      return { success: false, error: "No recipient email found for shipment" };
    }

    // Build payload for template
    const payload = {
      shipment_number: shipment.shipmentNumber,
      shipment_type: shipment.type,
      carrier: shipment.carrier,
      tracking_number: shipment.trackingNumber,
      status: shipment.status,
      ship_date: shipment.shipDate ? new Date(shipment.shipDate).toLocaleDateString() : "TBD",
      delivery_date: shipment.deliveryDate ? new Date(shipment.deliveryDate).toLocaleDateString() : "TBD",
      from_address: shipment.fromAddress,
      to_address: shipment.toAddress,
      weight: shipment.weight,
      tracking_url: shipment.trackingNumber && shipment.carrier
        ? getTrackingUrl(shipment.carrier, shipment.trackingNumber)
        : null,
      view_shipment_url: `${ENV.publicAppUrl}/shipments/${shipmentId}`,
      ...options?.customPayload,
    };

    // Generate idempotency key
    const idempotencyKey = `shipment-${shipmentId}-${shipment.status}-${Date.now()}`;

    return await queueEmail({
      templateName: "SHIPMENT",
      to: { email: recipientEmail, name: recipientName },
      subject: options?.customSubject || `Shipment Update: ${shipment.shipmentNumber}`,
      payload,
      idempotencyKey,
      relatedEntityType: "shipment",
      relatedEntityId: shipmentId,
      triggeredBy: options?.triggeredBy,
    });
  } catch (error: any) {
    console.error(`[EmailService] Error sending shipment email for ${shipmentId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Send an Alert notification email
 */
export async function sendAlertEmail(
  alertId: number,
  options?: {
    triggeredBy?: number;
    customSubject?: string;
    customPayload?: Record<string, any>;
    recipientEmail?: string;
    recipientName?: string;
  }
): Promise<QueueEmailResult> {
  try {
    // Get alert
    const alert = await db.getAlertById(alertId);
    if (!alert) {
      return { success: false, error: "Alert not found" };
    }

    // Determine recipient
    let recipientEmail = options?.recipientEmail;
    let recipientName = options?.recipientName;

    if (!recipientEmail && alert.assignedTo) {
      const user = await db.getTeamMemberById(alert.assignedTo);
      if (user?.email) {
        recipientEmail = user.email;
        recipientName = user.name || undefined;
      }
    }

    if (!recipientEmail) {
      return { success: false, error: "No recipient email found for alert" };
    }

    // Build payload for template
    const payload = {
      alert_number: alert.alertNumber,
      alert_type: alert.type,
      severity: alert.severity,
      status: alert.status,
      title: alert.title,
      description: alert.description,
      entity_type: alert.entityType,
      entity_id: alert.entityId,
      threshold_value: alert.thresholdValue,
      actual_value: alert.actualValue,
      created_at: new Date(alert.createdAt).toLocaleString(),
      view_alert_url: `${ENV.publicAppUrl}/alerts/${alertId}`,
      ...options?.customPayload,
    };

    // Generate idempotency key
    const idempotencyKey = `alert-${alertId}-${Date.now()}`;

    return await queueEmail({
      templateName: "ALERT",
      to: { email: recipientEmail, name: recipientName },
      subject: options?.customSubject || `[${alert.severity.toUpperCase()}] Alert: ${alert.title}`,
      payload,
      idempotencyKey,
      relatedEntityType: "alert",
      relatedEntityId: alertId,
      triggeredBy: options?.triggeredBy,
    });
  } catch (error: any) {
    console.error(`[EmailService] Error sending alert email for ${alertId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Send an RFQ email to vendors
 */
export async function sendRFQEmail(
  rfqId: number,
  vendorId: number,
  options?: {
    triggeredBy?: number;
    customSubject?: string;
    customPayload?: Record<string, any>;
  }
): Promise<QueueEmailResult> {
  try {
    // Get RFQ
    const rfq = await db.getVendorRfqById(rfqId);
    if (!rfq) {
      return { success: false, error: "RFQ not found" };
    }

    // Get vendor
    const vendor = await db.getVendorById(vendorId);
    if (!vendor || !vendor.email) {
      return { success: false, error: "Vendor email not found" };
    }

    // Build payload for template
    const payload = {
      rfq_number: rfq.rfqNumber,
      vendor_name: vendor.name,
      material_name: rfq.materialName,
      material_description: rfq.materialDescription,
      quantity: rfq.quantity,
      unit: rfq.unit,
      specifications: rfq.specifications,
      required_delivery_date: rfq.requiredDeliveryDate
        ? new Date(rfq.requiredDeliveryDate).toLocaleDateString()
        : "Flexible",
      delivery_location: rfq.deliveryLocation,
      delivery_address: rfq.deliveryAddress,
      incoterms: rfq.incoterms,
      quote_due_date: rfq.quoteDueDate
        ? new Date(rfq.quoteDueDate).toLocaleDateString()
        : "ASAP",
      validity_period: rfq.validityPeriod,
      notes: rfq.notes,
      respond_url: `${ENV.publicAppUrl}/vendor-portal/rfq/${rfqId}?vendor=${vendorId}`,
      ...options?.customPayload,
    };

    // Generate idempotency key
    const idempotencyKey = `rfq-${rfqId}-vendor-${vendorId}-${Date.now()}`;

    return await queueEmail({
      templateName: "RFQ",
      to: { email: vendor.email, name: vendor.name },
      subject: options?.customSubject || `Request for Quote: ${rfq.materialName} (${rfq.rfqNumber})`,
      payload,
      idempotencyKey,
      relatedEntityType: "vendor_rfq",
      relatedEntityId: rfqId,
      triggeredBy: options?.triggeredBy,
    });
  } catch (error: any) {
    console.error(`[EmailService] Error sending RFQ email for ${rfqId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Get tracking URL for common carriers
 */
function getTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const carrierLower = carrier.toLowerCase();

  if (carrierLower.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${trackingNumber}`;
  }
  if (carrierLower.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
  }
  if (carrierLower.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
  }
  if (carrierLower.includes("dhl")) {
    return `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`;
  }

  return null;
}

/**
 * Get email service status
 */
export function getStatus(): {
  configured: boolean;
  provider: string;
  configDetails: ReturnType<typeof sendgrid.getConfigStatus>;
} {
  return {
    configured: sendgrid.isConfigured(),
    provider: "sendgrid",
    configDetails: sendgrid.getConfigStatus(),
  };
}
