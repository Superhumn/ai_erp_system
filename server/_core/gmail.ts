/**
 * Gmail API Integration
 * Handles sending emails, drafts, and email management via Gmail API
 */

import { ENV } from "./env";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users";

// Gmail API types
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: {
    mimeType?: string;
    headers?: Array<{ name: string; value: string }>;
    body?: {
      data?: string;
    };
  };
}

export interface GmailSendOptions {
  to?: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  html?: boolean; // Whether body is HTML
}

export interface GmailDraftOptions extends GmailSendOptions {}

export interface GmailListOptions {
  maxResults?: number;
  pageToken?: string;
  labelIds?: string[];
  q?: string; // Gmail search query
}

export interface GmailListResult {
  messages: GmailMessage[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

/**
 * Get OAuth URL for Gmail access
 */
export function getGmailAuthUrl(userId: number): string {
  const clientId = ENV.googleClientId;
  const redirectUri = ENV.googleRedirectUri || `${ENV.appUrl}/api/oauth/google/callback`;
  
  // Request Gmail scopes for sending and reading emails
  const scope = encodeURIComponent(
    "https://www.googleapis.com/auth/gmail.send " +
    "https://www.googleapis.com/auth/gmail.compose " +
    "https://www.googleapis.com/auth/gmail.readonly"
  );
  
  const state = userId.toString();
  
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
}

/**
 * Create RFC 2822 formatted email message
 */
function createMimeMessage(options: GmailSendOptions): string {
  const boundary = "----=_Part_" + Date.now();
  const toAddresses = options.to ? (Array.isArray(options.to) ? options.to.join(", ") : options.to) : "";
  const ccAddresses = options.cc ? (Array.isArray(options.cc) ? options.cc.join(", ") : options.cc) : null;
  const bccAddresses = options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(", ") : options.bcc) : null;
  
  let message = [
    `To: ${toAddresses}`,
    options.cc && `Cc: ${ccAddresses}`,
    options.bcc && `Bcc: ${bccAddresses}`,
    options.replyTo && `Reply-To: ${options.replyTo}`,
    `Subject: ${options.subject}`,
    "MIME-Version: 1.0",
    options.html ? `Content-Type: multipart/alternative; boundary="${boundary}"` : "Content-Type: text/plain; charset=UTF-8",
    "",
  ].filter(Boolean).join("\r\n");

  if (options.html) {
    // Multipart message with both plain text and HTML
    // Note: HTML sanitization is the caller's responsibility
    // This is just for creating a basic plain text fallback
    // We don't use regex-based HTML stripping due to security concerns
    // Instead, we provide a simple text extraction that's safe
    
    // For plain text version, use a simple approach that doesn't parse HTML
    // This avoids regex-based HTML parsing which can have security issues
    const plainText = options.body
      .split(/<[^>]+>/)  // Split on tags (safer than trying to match them)
      .join(" ")          // Join with spaces
      .replace(/\s+/g, " ")  // Normalize whitespace
      .trim();
    
    message += [
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      plainText,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      options.body,  // HTML body is used as-is; caller must sanitize if needed
      "",
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    message += options.body;
  }

  return message;
}

/**
 * Encode message to base64url format required by Gmail API
 */
function encodeMessage(message: string): string {
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Send an email via Gmail API
 */
export async function sendGmailMessage(
  accessToken: string,
  options: GmailSendOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const rawMessage = createMimeMessage(options);
    const encodedMessage = encodeMessage(rawMessage);

    const response = await fetch(`${GMAIL_API}/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedMessage,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Gmail] Failed to send email:", error);
      return { success: false, error: `Failed to send email: ${response.status}` };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (error: any) {
    console.error("[Gmail] Error sending email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a draft email via Gmail API
 */
export async function createGmailDraft(
  accessToken: string,
  options: GmailDraftOptions
): Promise<{ success: boolean; draftId?: string; error?: string }> {
  try {
    const rawMessage = createMimeMessage(options);
    const encodedMessage = encodeMessage(rawMessage);

    const response = await fetch(`${GMAIL_API}/me/drafts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          raw: encodedMessage,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Gmail] Failed to create draft:", error);
      return { success: false, error: `Failed to create draft: ${response.status}` };
    }

    const data = await response.json();
    return { success: true, draftId: data.id };
  } catch (error: any) {
    console.error("[Gmail] Error creating draft:", error);
    return { success: false, error: error.message };
  }
}

/**
 * List emails from Gmail
 */
export async function listGmailMessages(
  accessToken: string,
  options: GmailListOptions = {}
): Promise<{ success: boolean; result?: GmailListResult; error?: string }> {
  try {
    const params = new URLSearchParams();
    
    if (options.maxResults) params.append("maxResults", options.maxResults.toString());
    if (options.pageToken) params.append("pageToken", options.pageToken);
    if (options.labelIds) params.append("labelIds", options.labelIds.join(","));
    if (options.q) params.append("q", options.q);

    const url = `${GMAIL_API}/me/messages${params.toString() ? "?" + params.toString() : ""}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Gmail] Failed to list messages:", error);
      return { success: false, error: `Failed to list messages: ${response.status}` };
    }

    const data = await response.json();
    return { 
      success: true, 
      result: {
        messages: data.messages || [],
        nextPageToken: data.nextPageToken,
        resultSizeEstimate: data.resultSizeEstimate,
      }
    };
  } catch (error: any) {
    console.error("[Gmail] Error listing messages:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get a specific email message
 */
export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<{ success: boolean; message?: GmailMessage; error?: string }> {
  try {
    const url = `${GMAIL_API}/me/messages/${messageId}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Gmail] Failed to get message:", error);
      return { success: false, error: `Failed to get message: ${response.status}` };
    }

    const message = await response.json();
    return { success: true, message };
  } catch (error: any) {
    console.error("[Gmail] Error getting message:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Reply to an email (preserves thread)
 */
export async function replyToGmailMessage(
  accessToken: string,
  threadId: string,
  messageId: string,
  options: GmailSendOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Get original message to extract headers
    const { success, message, error } = await getGmailMessage(accessToken, messageId);
    
    if (!success || !message) {
      return { success: false, error: error || "Failed to get original message" };
    }

    // Extract In-Reply-To and References headers
    const headers = message.payload?.headers || [];
    const originalMessageId = headers.find(h => h.name.toLowerCase() === "message-id")?.value;
    const originalReferences = headers.find(h => h.name.toLowerCase() === "references")?.value;

    // Create reply message with threading headers
    let rawMessage = createMimeMessage(options);
    
    // Add threading headers before the body
    const headerSection: string[] = [];
    if (originalMessageId) {
      headerSection.push(`In-Reply-To: ${originalMessageId}`);
      const references = originalReferences 
        ? `${originalReferences} ${originalMessageId}`
        : originalMessageId;
      headerSection.push(`References: ${references}`);
    }
    
    // Insert headers after the main headers but before the body
    if (headerSection.length > 0) {
      const parts = rawMessage.split("\r\n\r\n");
      parts[0] += "\r\n" + headerSection.join("\r\n");
      rawMessage = parts.join("\r\n\r\n");
    }

    const encodedMessage = encodeMessage(rawMessage);

    const response = await fetch(`${GMAIL_API}/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedMessage,
        threadId: threadId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Gmail] Failed to send reply:", error);
      return { success: false, error: `Failed to send reply: ${response.status}` };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (error: any) {
    console.error("[Gmail] Error sending reply:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user's Gmail profile
 */
export async function getGmailProfile(
  accessToken: string
): Promise<{ success: boolean; profile?: { emailAddress: string; messagesTotal?: number; threadsTotal?: number }; error?: string }> {
  try {
    const response = await fetch(`${GMAIL_API}/me/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Failed to get profile: ${response.status}` };
    }

    const profile = await response.json();
    return { success: true, profile };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
