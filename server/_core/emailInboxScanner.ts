// @ts-nocheck
import { ImapFlow } from "imapflow";
import { ENV } from "./env";
import { quickCategorize, parseEmailContent, type EmailCategorization, type EmailParseResult } from "./emailParser";
import { isAlibabaEmail, ALIBABA_PARSE_HINT } from "./alibabaEmail";

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

  // Reset AI parse counter for this scan cycle — allow up to 10 per scan
  (globalThis as any).__aiParseCount = 0;

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
        }, { uid: true, markSeen: false });

        if (!message) continue;

        // Parse the email
        const scannedEmail = await parseImapMessage(message, client, uid);
        
        if (scannedEmail) {
          // Quick categorize the email
          scannedEmail.categorization = quickCategorize(
            scannedEmail.subject,
            scannedEmail.from.address,
            scannedEmail.bodyText
          );

          // Skip promotional/newsletter/spam emails
          const skipPatterns = /unsubscribe|newsletter|promo(tion)?|marketing|no-?reply@|noreply@|mailchimp|sendgrid\.net|constantcontact|hubspot|campaigns?@|updates?@|news@|digest@|weekly.*summary|daily.*digest/i;
          const isPromotional = skipPatterns.test(scannedEmail.subject) ||
                                skipPatterns.test(scannedEmail.from.address) ||
                                skipPatterns.test(scannedEmail.bodyText || '');
          if (isPromotional) {
            continue; // Skip this email
          }

          result.processedEmails.push(scannedEmail);

          // Email -> task extraction pipeline (pre-filter, LLM classify,
          // signal boost, threshold, dedupe). Defined in ../emailTaskExtractor.
          // Rate limit: up to 10 LLM calls per scan cycle.
          const emailAge = scannedEmail.date ? (Date.now() - new Date(scannedEmail.date).getTime()) : Infinity;
          const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
          if (!((globalThis as any).__aiParseCount)) (globalThis as any).__aiParseCount = 0;
          if ((globalThis as any).__aiParseCount < 10 && emailAge < SEVEN_DAYS) {
            (globalThis as any).__aiParseCount++;
            try {
              const { extractAndCreateTasks } = await import("../emailTaskExtractor");
              await extractAndCreateTasks({
                messageId: scannedEmail.messageId,
                from: scannedEmail.from,
                subject: scannedEmail.subject,
                bodyText: scannedEmail.bodyText || "",
                date: scannedEmail.date,
              });
            } catch { /* extraction failed, already logged inside extractor */ }
          }

          // Auto-log to CRM if sender is a known contact
          try {
            const db = await import("../db");
            const contacts = await db.getCrmContacts?.();
            if (contacts) {
              const contactList = Array.isArray(contacts) ? contacts : [];
              const contact = contactList.find(
                (c: any) => c.email?.toLowerCase() === scannedEmail.from.address?.toLowerCase()
              );
              if (contact) {
                await db.createCrmInteraction?.({
                  contactId: contact.id,
                  channel: "email",
                  interactionType: "received",
                  subject: scannedEmail.subject,
                  content: `Email received: ${scannedEmail.subject}`,
                  userId: 1,
                } as any);
              }
            }
          } catch {
            // CRM linking failed, skip
          }

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
    const bodyPart = await client.download(uid.toString(), undefined, { uid: true, markSeen: false });
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

    // Download actual attachment content for parseable files
    const attachmentContents: Array<{ filename: string; contentType: string; data: Buffer }> = [];
    if (message.bodyStructure?.childNodes) {
      let partIndex = 1;
      for (const child of message.bodyStructure.childNodes) {
        partIndex++;
        if (child.disposition === "attachment" || (child.disposition === "inline" && child.type !== "text")) {
          const filename = child.dispositionParameters?.filename || child.parameters?.name || "";
          const contentType = `${child.type}/${child.subtype}`;
          // Only download PDFs, images, docs (skip large files >5MB)
          const isParseable = /pdf|image|msword|spreadsheet|csv|excel|png|jpg|jpeg/i.test(contentType) || /\.pdf$|\.png$|\.jpg$|\.jpeg$|\.xlsx?$|\.csv$|\.doc/i.test(filename);
          if (isParseable && (child.size || 0) < 5 * 1024 * 1024) {
            try {
              const part = await client.download(uid.toString(), String(partIndex), { uid: true, markSeen: false });
              if (part?.content) {
                const chunks: Buffer[] = [];
                for await (const chunk of part.content) chunks.push(chunk);
                attachmentContents.push({ filename, contentType, data: Buffer.concat(chunks) });
              }
            } catch { /* attachment download failed, skip */ }
          }
        }
      }
    }

    const result: any = {
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
      attachmentContents,
      flags: message.flags ? Array.from(message.flags) : [],
    };
    return result;
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
          email.from.name,
          isAlibabaEmail(email.from.address) ? ALIBABA_PARSE_HINT : undefined
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
