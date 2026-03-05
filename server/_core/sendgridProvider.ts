/**
 * SendGrid Provider Adapter
 *
 * Encapsulates all SendGrid-specific logic for sending transactional emails
 * using dynamic templates.
 */

import sgMail from "@sendgrid/mail";
import { ENV } from "./env";

// Initialize SendGrid with API key if available
if (ENV.sendgridApiKey) {
  sgMail.setApiKey(ENV.sendgridApiKey);
}

export interface SendGridSendOptions {
  templateId: string;           // SendGrid dynamic template ID (d-xxx)
  to: {
    email: string;
    name?: string;
  };
  from: {
    email: string;
    name?: string;
  };
  replyTo?: {
    email: string;
    name?: string;
  };
  subject?: string;             // Optional - can be set in template
  dynamicTemplateData: Record<string, any>;  // Template variables
  customArgs?: Record<string, string>;       // Custom arguments for tracking
}

export interface SendGridResult {
  success: boolean;
  providerMessageId?: string;
  statusCode?: number;
  error?: {
    message: string;
    code?: string;
    field?: string;
    isTransient: boolean;  // Can be retried
  };
}

/**
 * Send an email using SendGrid dynamic templates
 */
export async function sendWithTemplate(options: SendGridSendOptions): Promise<SendGridResult> {
  // Check if SendGrid is configured
  if (!ENV.sendgridApiKey) {
    return {
      success: false,
      error: {
        message: "SendGrid API key not configured. Add SENDGRID_API_KEY to environment.",
        code: "CONFIG_ERROR",
        isTransient: false,
      },
    };
  }

  if (!ENV.sendgridFromEmail && !options.from.email) {
    return {
      success: false,
      error: {
        message: "SendGrid from email not configured. Add SENDGRID_FROM_EMAIL to environment.",
        code: "CONFIG_ERROR",
        isTransient: false,
      },
    };
  }

  try {
    const msg: sgMail.MailDataRequired = {
      to: options.to,
      from: options.from.email ? options.from : { email: ENV.sendgridFromEmail },
      templateId: options.templateId,
      dynamicTemplateData: options.dynamicTemplateData,
    };

    // Add optional fields
    if (options.subject) {
      msg.subject = options.subject;
    }

    if (options.replyTo) {
      msg.replyTo = options.replyTo;
    } else if (ENV.sendgridReplyTo) {
      msg.replyTo = { email: ENV.sendgridReplyTo };
    }

    if (options.customArgs) {
      msg.customArgs = options.customArgs;
    }

    const [response] = await sgMail.send(msg);

    console.log(`[SendGrid] Sent template ${options.templateId} to ${options.to.email} - Status: ${response.statusCode}`);

    return {
      success: true,
      providerMessageId: response.headers["x-message-id"] as string,
      statusCode: response.statusCode,
    };
  } catch (error: any) {
    console.error("[SendGrid] Failed to send:", error?.response?.body || error.message);

    // Parse SendGrid error response
    const errorBody = error?.response?.body;
    const errorMessage = errorBody?.errors?.[0]?.message || error.message || "Failed to send email";
    const errorCode = errorBody?.errors?.[0]?.code || error.code;
    const errorField = errorBody?.errors?.[0]?.field;

    // Determine if error is transient (can be retried)
    const isTransient = isTransientError(error);

    return {
      success: false,
      statusCode: error?.response?.statusCode,
      error: {
        message: errorMessage,
        code: errorCode,
        field: errorField,
        isTransient,
      },
    };
  }
}

/**
 * Send a simple email without a template (fallback)
 */
export async function sendSimple(options: {
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<SendGridResult> {
  if (!ENV.sendgridApiKey) {
    return {
      success: false,
      error: {
        message: "SendGrid API key not configured",
        code: "CONFIG_ERROR",
        isTransient: false,
      },
    };
  }

  try {
    const msg = {
      to: options.to,
      from: options.from || ENV.sendgridFromEmail,
      subject: options.subject,
      text: options.text || "",
      html: options.html || options.text || "",
      replyTo: options.replyTo || ENV.sendgridReplyTo || undefined,
    };

    const [response] = await sgMail.send(msg);

    return {
      success: true,
      providerMessageId: response.headers["x-message-id"] as string,
      statusCode: response.statusCode,
    };
  } catch (error: any) {
    const isTransient = isTransientError(error);
    return {
      success: false,
      statusCode: error?.response?.statusCode,
      error: {
        message: error?.response?.body?.errors?.[0]?.message || error.message,
        code: error?.code,
        isTransient,
      },
    };
  }
}

/**
 * Determine if an error is transient and can be retried
 */
function isTransientError(error: any): boolean {
  const statusCode = error?.response?.statusCode;

  // Rate limiting - can retry
  if (statusCode === 429) return true;

  // Server errors - can retry
  if (statusCode >= 500 && statusCode < 600) return true;

  // Network errors - can retry
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // Client errors (4xx except 429) - don't retry
  if (statusCode >= 400 && statusCode < 500) return false;

  return false;
}

/**
 * Verify a SendGrid webhook signature
 * https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
 */
export function verifyWebhookSignature(
  publicKey: string,
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  if (!ENV.sendgridWebhookSecret) {
    if (ENV.isProduction) {
      console.error("[SendGrid] Webhook secret not configured in production - rejecting request");
      return false;
    }
    console.warn("[SendGrid] Webhook secret not configured - skipping signature verification (dev only)");
    return true;
  }

  try {
    const crypto = require('crypto');

    // Combine timestamp and payload
    const timestampPayload = timestamp + payload;

    // Verify ECDSA signature
    const verifier = crypto.createVerify('sha256');
    verifier.update(timestampPayload);

    // The signature is base64 encoded
    const signatureBuffer = Buffer.from(signature, 'base64');

    return verifier.verify(publicKey, signatureBuffer);
  } catch (error) {
    console.error("[SendGrid] Signature verification failed:", error);
    return false;
  }
}

/**
 * Map SendGrid event types to our status enum
 */
export function mapEventToStatus(eventType: string): string | null {
  const mapping: Record<string, string> = {
    // Successful delivery
    'delivered': 'delivered',

    // Bounce events
    'bounce': 'bounced',
    'blocked': 'bounced',

    // Drop events
    'dropped': 'dropped',

    // Deferred events (temporary failure)
    'deferred': 'deferred',

    // Processing events (we already have 'sent' status)
    'processed': null, // Don't update - we set this when we send

    // Engagement events (informational only, don't change status)
    'open': null,
    'click': null,
    'unsubscribe': null,
    'spamreport': null,
    'group_unsubscribe': null,
    'group_resubscribe': null,
  };

  return mapping[eventType] ?? null;
}

/**
 * Check if SendGrid is properly configured
 */
export function isConfigured(): boolean {
  return !!(ENV.sendgridApiKey && ENV.sendgridFromEmail);
}

/**
 * Get configuration status for diagnostics
 */
export function getConfigStatus(): {
  configured: boolean;
  hasApiKey: boolean;
  hasFromEmail: boolean;
  hasReplyTo: boolean;
  hasWebhookSecret: boolean;
} {
  return {
    configured: isConfigured(),
    hasApiKey: !!ENV.sendgridApiKey,
    hasFromEmail: !!ENV.sendgridFromEmail,
    hasReplyTo: !!ENV.sendgridReplyTo,
    hasWebhookSecret: !!ENV.sendgridWebhookSecret,
  };
}
