import sgMail from "@sendgrid/mail";
import { ENV } from "./env";

// Initialize SendGrid with API key if available
if (ENV.sendgridApiKey) {
  sgMail.setApiKey(ENV.sendgridApiKey);
}

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    content: string; // Base64 encoded
    filename: string;
    type?: string;
    disposition?: string;
  }>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Check if SendGrid is configured and ready to send emails
 */
export function isEmailConfigured(): boolean {
  return !!(ENV.sendgridApiKey && ENV.sendgridFromEmail);
}

/**
 * Send an email using SendGrid
 * Returns success: false if SendGrid is not configured (graceful degradation)
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  // Check if SendGrid is configured
  if (!ENV.sendgridApiKey) {
    console.warn("[Email] SendGrid API key not configured - email not sent");
    return {
      success: false,
      error: "SendGrid API key not configured. Add SENDGRID_API_KEY to secrets.",
    };
  }

  if (!ENV.sendgridFromEmail) {
    console.warn("[Email] SendGrid from email not configured - email not sent");
    return {
      success: false,
      error: "SendGrid from email not configured. Add SENDGRID_FROM_EMAIL to secrets.",
    };
  }

  const fromEmail = options.from || ENV.sendgridFromEmail;

  try {
    const msg: {
      to: string;
      from: string;
      subject: string;
      text: string;
      html: string;
      replyTo?: string;
      attachments?: Array<{
        content: string;
        filename: string;
        type?: string;
        disposition?: string;
      }>;
    } = {
      to: options.to,
      from: fromEmail,
      subject: options.subject,
      text: options.text || "",
      html: options.html || options.text || "",
      replyTo: options.replyTo,
    };

    // Add attachments if provided
    if (options.attachments && options.attachments.length > 0) {
      msg.attachments = options.attachments;
    }

    const [response] = await sgMail.send(msg);
    
    console.log(`[Email] Sent to ${options.to} - Status: ${response.statusCode}`);
    
    return {
      success: true,
      messageId: response.headers["x-message-id"] as string,
    };
  } catch (error: any) {
    console.error("[Email] Failed to send:", error?.response?.body || error.message);
    
    return {
      success: false,
      error: error?.response?.body?.errors?.[0]?.message || error.message || "Failed to send email",
    };
  }
}

/**
 * Send multiple emails (batch)
 * SendGrid supports up to 1000 recipients per request
 */
export async function sendBulkEmails(
  emails: EmailOptions[]
): Promise<{ sent: number; failed: number; results: EmailResult[] }> {
  const results: EmailResult[] = [];
  let sent = 0;
  let failed = 0;

  for (const email of emails) {
    const result = await sendEmail(email);
    results.push(result);
    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed, results };
}

/**
 * Format plain text email body to HTML with basic styling
 */
export function formatEmailHtml(text: string): string {
  // Convert line breaks to <br> and wrap in basic HTML
  const htmlBody = text
    .split("\n")
    .map((line) => {
      // Check if line looks like a header (all caps or ends with :)
      if (line.match(/^[A-Z\s]+:?$/) || line.endsWith(":")) {
        return `<strong>${line}</strong>`;
      }
      return line;
    })
    .join("<br>\n");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    strong {
      color: #1a1a1a;
    }
  </style>
</head>
<body>
  ${htmlBody}
</body>
</html>
  `.trim();
}
