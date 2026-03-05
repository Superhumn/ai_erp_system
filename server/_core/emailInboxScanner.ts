import { ImapFlow } from "imapflow";
import { ENV } from "./env";
import { quickCategorize, parseEmailContent, type EmailCategorization, type EmailParseResult } from "./emailParser";

// Email inbox configuration
export interface EmailInboxConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  // Optional: for OAuth2 (Gmail, Outlook)
  oauth2?: {
    accessToken: string;
    refreshToken?: string;
  };
}

// Scanned email result
export interface ScannedEmail {
  uid: number;
  messageId: string;
  from: {
    address: string;
    name?: string;
  };
  to: string[];
  subject: string;
  date: Date;
  bodyText: string;
  bodyHtml?: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
  flags: string[];
  categorization?: EmailCategorization;
}

// Scan result
export interface InboxScanResult {
  success: boolean;
  totalEmails: number;
  newEmails: number;
  processedEmails: ScannedEmail[];
  errors: string[];
}

// Get IMAP config from environment
export function getImapConfig(): EmailInboxConfig | null {
  const host = ENV.imapHost;
  const port = parseInt(ENV.imapPort || "993", 10);
  const user = ENV.imapUser;
  const pass = ENV.imapPassword;

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 993,
    auth: { user, pass },
  };
}

// Check if IMAP is configured
export function isImapConfigured(): boolean {
  return getImapConfig() !== null;
}

// Common IMAP server configurations
export const IMAP_PRESETS: Record<string, Partial<EmailInboxConfig>> = {
  gmail: {
    host: "imap.gmail.com",
    port: 993,
    secure: true,
  },
  outlook: {
    host: "outlook.office365.com",
    port: 993,
    secure: true,
  },
  yahoo: {
    host: "imap.mail.yahoo.com",
    port: 993,
    secure: true,
  },
  icloud: {
    host: "imap.mail.me.com",
    port: 993,
    secure: true,
  },
};

/**
 * Connect to IMAP server and scan inbox for emails
 */
export async function scanInbox(
  config: EmailInboxConfig,
  options: {
    folder?: string;
    limit?: number;
    since?: Date;
    unseenOnly?: boolean;
    markAsSeen?: boolean;
  } = {}
): Promise<InboxScanResult> {
  const {
    folder = "INBOX",
    limit = 50,
    since,
    unseenOnly = true,
    markAsSeen = false,
  } = options;

  const result: InboxScanResult = {
    success: false,
    totalEmails: 0,
    newEmails: 0,
    processedEmails: [],
    errors: [],
  };

  let client: ImapFlow | null = null;

  try {
    // Create IMAP client
    client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      logger: false, // Disable verbose logging
    });

    // Connect to server
    await client.connect();

    // Select mailbox
    const mailbox = await client.mailboxOpen(folder);
    result.totalEmails = mailbox.exists || 0;

    // Build search criteria
    const searchCriteria: any = {};
    
    if (unseenOnly) {
      searchCriteria.seen = false;
    }
    
    if (since) {
      searchCriteria.since = since;
    }

    // Search for messages
    const searchResult = await client.search(searchCriteria, { uid: true });
    const messages = searchResult === false ? [] : searchResult;
    
    // Limit the number of messages to fetch
    const messagesToFetch = messages.slice(-limit);
    result.newEmails = messagesToFetch.length;

    // Fetch each message
    for (const uid of messagesToFetch) {
      try {
        const message = await client.fetchOne(uid.toString(), {
          uid: true,
          flags: true,
          envelope: true,
          bodyStructure: true,
          source: true,
        }, { uid: true });

        if (!message) continue;

        // Parse the email
        const scannedEmail = await parseImapMessage(message, client, uid);
        
        if (scannedEmail) {
          // Quick categorize the email
          scannedEmail.categorization = quickCategorize(
            scannedEmail.subject,
            scannedEmail.from.address
          );
          
          result.processedEmails.push(scannedEmail);

          // Mark as seen if requested
          if (markAsSeen) {
            await client.messageFlagsAdd(uid.toString(), ["\\Seen"], { uid: true });
          }
        }
      } catch (msgError: any) {
        result.errors.push(`Error processing message ${uid}: ${msgError.message}`);
      }
    }

    result.success = true;
  } catch (error: any) {
    result.errors.push(`IMAP connection error: ${error.message}`);
  } finally {
    // Close connection
    if (client) {
      try {
        await client.logout();
      } catch {
        // Ignore logout errors
      }
    }
  }

  return result;
}

/**
 * Parse an IMAP message into our ScannedEmail format
 */
async function parseImapMessage(
  message: any,
  client: ImapFlow,
  uid: number
): Promise<ScannedEmail | null> {
  try {
    const envelope = message.envelope;
    if (!envelope) return null;

    // Get the message body
    let bodyText = "";
    let bodyHtml = "";

    // Fetch the body parts
    const bodyPart = await client.download(uid.toString(), undefined, { uid: true });
    if (bodyPart && bodyPart.content) {
      const chunks: Buffer[] = [];
      for await (const chunk of bodyPart.content) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf-8");
      
      // Simple extraction - in production you'd use a proper MIME parser
      bodyText = extractTextFromRaw(rawBody);
      bodyHtml = extractHtmlFromRaw(rawBody);
    }

    // Extract attachments info from bodyStructure
    const attachments: ScannedEmail["attachments"] = [];
    if (message.bodyStructure) {
      extractAttachments(message.bodyStructure, attachments);
    }

    return {
      uid,
      messageId: envelope.messageId || `${uid}`,
      from: {
        address: envelope.from?.[0]?.address || "",
        name: envelope.from?.[0]?.name,
      },
      to: envelope.to?.map((t: any) => t.address) || [],
      subject: envelope.subject || "(No subject)",
      date: envelope.date ? new Date(envelope.date) : new Date(),
      bodyText: bodyText || bodyHtml?.replace(/<[^>]*>/g, " ").trim() || "",
      bodyHtml,
      attachments,
      flags: message.flags ? Array.from(message.flags) : [],
    };
  } catch (error) {
    console.error("Error parsing IMAP message:", error);
    return null;
  }
}

/**
 * Extract plain text from raw email
 */
function extractTextFromRaw(raw: string): string {
  // Look for text/plain content
  const textMatch = raw.match(/Content-Type:\s*text\/plain[^]*?\r?\n\r?\n([^]*?)(?=--|\r?\n\r?\n[A-Z]|$)/i);
  if (textMatch) {
    return decodeEmailBody(textMatch[1].trim());
  }
  
  // Fallback: try to get content after headers
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd > 0) {
    return decodeEmailBody(raw.substring(headerEnd + 4).trim());
  }
  
  return "";
}

/**
 * Extract HTML from raw email
 */
function extractHtmlFromRaw(raw: string): string {
  const htmlMatch = raw.match(/Content-Type:\s*text\/html[^]*?\r?\n\r?\n([^]*?)(?=--|\r?\n\r?\n[A-Z]|$)/i);
  if (htmlMatch) {
    return decodeEmailBody(htmlMatch[1].trim());
  }
  return "";
}

/**
 * Decode email body (handle quoted-printable, base64)
 */
function decodeEmailBody(body: string): string {
  // Handle quoted-printable
  if (body.includes("=\r\n") || body.includes("=\n")) {
    body = body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  
  // Handle base64
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(body.replace(/\s/g, ""))) {
    try {
      const decoded = Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf-8");
      if (decoded.length > 0 && !decoded.includes("\ufffd")) {
        return decoded;
      }
    } catch {
      // Not base64, return as-is
    }
  }
  
  return body;
}

/**
 * Extract attachment info from body structure
 */
function extractAttachments(
  structure: any,
  attachments: ScannedEmail["attachments"]
): void {
  if (!structure) return;

  // Check if this part is an attachment
  if (structure.disposition === "attachment" || structure.disposition === "inline") {
    attachments.push({
      filename: structure.dispositionParameters?.filename || structure.parameters?.name || "attachment",
      contentType: `${structure.type}/${structure.subtype}`,
      size: structure.size || 0,
    });
  }

  // Recurse into child parts
  if (structure.childNodes) {
    for (const child of structure.childNodes) {
      extractAttachments(child, attachments);
    }
  }
}

/**
 * Scan inbox and process emails with full AI categorization
 */
export async function scanAndCategorizeInbox(
  config: EmailInboxConfig,
  options: {
    folder?: string;
    limit?: number;
    since?: Date;
    unseenOnly?: boolean;
    markAsSeen?: boolean;
    fullAiParsing?: boolean;
  } = {}
): Promise<{
  scanResult: InboxScanResult;
  parsedResults: Array<{
    email: ScannedEmail;
    parseResult?: EmailParseResult;
  }>;
}> {
  const { fullAiParsing = false, ...scanOptions } = options;
  
  // First, scan the inbox
  const scanResult = await scanInbox(config, scanOptions);
  
  const parsedResults: Array<{
    email: ScannedEmail;
    parseResult?: EmailParseResult;
  }> = [];

  // If full AI parsing is requested, parse each email
  if (fullAiParsing && scanResult.success) {
    for (const email of scanResult.processedEmails) {
      try {
        const parseResult = await parseEmailContent(
          email.subject,
          email.bodyText,
          email.from.address,
          email.from.name
        );
        
        // Update categorization from AI if available
        if (parseResult.categorization) {
          email.categorization = parseResult.categorization;
        }
        
        parsedResults.push({ email, parseResult });
      } catch (error: any) {
        parsedResults.push({ email });
        scanResult.errors.push(`AI parsing error for ${email.messageId}: ${error.message}`);
      }
    }
  } else {
    // Just return emails with quick categorization
    for (const email of scanResult.processedEmails) {
      parsedResults.push({ email });
    }
  }

  return { scanResult, parsedResults };
}

/**
 * Download email attachments via IMAP and upload to storage.
 * Returns a map of attachment filename -> storage URL.
 */
export async function downloadEmailAttachments(
  config: EmailInboxConfig,
  uid: number,
  folder: string = "INBOX"
): Promise<Array<{ filename: string; mimeType: string; size: number; storageUrl: string }>> {
  const { storagePut } = await import("../storage");
  const downloaded: Array<{ filename: string; mimeType: string; size: number; storageUrl: string }> = [];
  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      logger: false,
    });

    await client.connect();
    await client.mailboxOpen(folder);

    // Fetch body structure to find attachment parts
    const message = await client.fetchOne(uid.toString(), {
      uid: true,
      bodyStructure: true,
    }, { uid: true });

    if (!message?.bodyStructure) {
      return downloaded;
    }

    // Find attachment parts and their part numbers
    const attachmentParts: Array<{ partNumber: string; filename: string; mimeType: string; size: number }> = [];
    findAttachmentParts(message.bodyStructure, attachmentParts, "");

    for (const part of attachmentParts) {
      try {
        const bodyPart = await client.download(uid.toString(), part.partNumber, { uid: true });
        if (bodyPart?.content) {
          const chunks: Buffer[] = [];
          for await (const chunk of bodyPart.content) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);

          // Upload to storage
          const storageKey = `email-attachments/${uid}/${Date.now()}-${part.filename}`;
          const { url } = await storagePut(storageKey, buffer, part.mimeType);

          downloaded.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: buffer.length,
            storageUrl: url,
          });
        }
      } catch (partErr) {
        console.error(`[EmailScanner] Failed to download part ${part.partNumber}:`, partErr);
      }
    }
  } catch (error) {
    console.error("[EmailScanner] Failed to download attachments:", error);
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }

  return downloaded;
}

/**
 * Recursively find attachment parts in a body structure
 */
function findAttachmentParts(
  structure: any,
  parts: Array<{ partNumber: string; filename: string; mimeType: string; size: number }>,
  parentPart: string
): void {
  if (!structure) return;

  if (structure.disposition === "attachment" || structure.disposition === "inline") {
    const mimeType = `${structure.type}/${structure.subtype}`;
    // Only download processable types (PDFs and images)
    if (mimeType === "application/pdf" || structure.type === "image") {
      parts.push({
        partNumber: structure.part || parentPart,
        filename: structure.dispositionParameters?.filename || structure.parameters?.name || "attachment",
        mimeType,
        size: structure.size || 0,
      });
    }
  }

  if (structure.childNodes) {
    for (let i = 0; i < structure.childNodes.length; i++) {
      const childPart = parentPart ? `${parentPart}.${i + 1}` : `${i + 1}`;
      findAttachmentParts(structure.childNodes[i], parts, childPart);
    }
  }
}

/**
 * Test IMAP connection
 */
export async function testImapConnection(config: EmailInboxConfig): Promise<{
  success: boolean;
  error?: string;
  mailboxes?: string[];
}> {
  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      logger: false,
    });

    await client.connect();
    
    // List mailboxes
    const mailboxes: string[] = [];
    const mailboxList = await client.list();
    for (const mailbox of mailboxList) {
      mailboxes.push(mailbox.path);
    }

    return { success: true, mailboxes };
  } catch (error: any) {
    return { success: false, error: error.message };
  } finally {
    if (client) {
      try {
        await client.logout();
      } catch {
        // Ignore
      }
    }
  }
}
