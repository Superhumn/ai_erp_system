// @ts-nocheck
import { ImapFlow } from "imapflow";
import { ENV } from "./env";
import { quickCategorize, parseEmailContent, type EmailCategorization, type EmailParseResult } from "./emailParser";

// Track processed email IDs to prevent duplicate task creation
const processedEmailIds = new Set<string>();

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

const ALLOWED_EMAIL_TASK_DOMAINS = new Set(["fundraising", "sales", "legal"]);

function normalizeEmailTaskDomain(value?: string): "fundraising" | "sales" | "legal" | null {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "fundraising" || normalized === "sales" || normalized === "legal") {
    return normalized;
  }
  if (normalized.includes("fund")) return "fundraising";
  if (normalized.includes("sale")) return "sales";
  if (normalized.includes("legal")) return "legal";
  return null;
}

function normalizeTaskPriority(value?: string): "low" | "medium" | "high" | "urgent" {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "urgent") return "urgent";
  if (normalized === "high") return "high";
  if (normalized === "low") return "low";
  return "medium";
}

async function routeSuggestedTaskToProject(params: {
  task: string;
  domain: "fundraising" | "sales" | "legal";
  fromAddress: string;
  subject: string;
}) {
  const db = await import("../db");
  const projects = await db.getProjects();
  if (!Array.isArray(projects) || projects.length === 0) {
    return { projectId: null as number | null, assigneeId: null as number | null };
  }

  const teamMembers = (await db.getTeamMembers?.()) || [];
  const projectIndex = new Map(projects.map((p: any) => [p.id, p]));
  const teamIndex = new Map((teamMembers as any[]).map((u: any) => [u.id, u]));

  // Prefer explicit domain projects before using AI routing.
  const domainProject = projects.find((p: any) => {
    const haystack = `${p.name || ""} ${p.description || ""}`.toLowerCase();
    return haystack.includes(params.domain);
  });
  if (domainProject) {
    return { projectId: domainProject.id, assigneeId: null as number | null };
  }

  try {
    const { invokeLLM } = await import("./llm");
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "Route this email task to the best existing project and optional assignee. Return JSON only: {\"projectId\":number|null,\"assigneeId\":number|null}. Use projectId/assigneeId only from lists. If unsure, return nulls.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: params.task,
            domain: params.domain,
            from: params.fromAddress,
            subject: params.subject,
            projects: projects.map((p: any) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              status: p.status,
            })),
            assignees: (teamMembers as any[]).map((u: any) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role,
              isActive: u.isActive,
            })),
          }),
        },
      ],
    });

    const text = typeof response.choices?.[0]?.message?.content === "string" ? response.choices[0].message.content : "";
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim() || "{}");
    const projectId = typeof parsed.projectId === "number" && projectIndex.has(parsed.projectId) ? parsed.projectId : null;
    const assigneeId = typeof parsed.assigneeId === "number" && teamIndex.has(parsed.assigneeId) ? parsed.assigneeId : null;
    return { projectId, assigneeId };
  } catch {
    return { projectId: null as number | null, assigneeId: null as number | null };
  }
}

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
        }, { uid: true });

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
                                skipPatterns.test(scannedEmail.body || '');
          if (isPromotional) {
            continue; // Skip this email
          }

          // Strip HTML from body to get plain text
          if (scannedEmail.body) {
            scannedEmail.body = scannedEmail.body
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/\s+/g, ' ')
              .trim();
          }

          result.processedEmails.push(scannedEmail);

          // Extract action items — dedup + rate limit
          const emailKey = `${scannedEmail.from?.address || ""}:${scannedEmail.subject || ""}:${scannedEmail.date || ""}`;
          if (!processedEmailIds.has(emailKey)) {
            processedEmailIds.add(emailKey);
            if (processedEmailIds.size > 5000) {
              Array.from(processedEmailIds).slice(0, 2500).forEach(e => processedEmailIds.delete(e));
            }
            // Only extract action items from emails less than 7 days old
            const emailAge = scannedEmail.date ? (Date.now() - new Date(scannedEmail.date).getTime()) : Infinity;
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
            if (!((globalThis as any).__aiParseCount)) (globalThis as any).__aiParseCount = 0;
            if ((globalThis as any).__aiParseCount < 10 && emailAge < SEVEN_DAYS) {
              (globalThis as any).__aiParseCount++;
              try {
                const { invokeLLM } = await import("./llm");
                const emailText = scannedEmail.bodyText || scannedEmail.subject;
                if (emailText && emailText.length > 50) {
                  const response = await invokeLLM({
                    messages: [
                      {
                        role: "system",
                        content:
                          "Extract action items from this email. Return JSON only: {\"actionItems\":[{\"task\":\"desc\",\"priority\":\"urgent|high|medium|low\",\"domain\":\"fundraising|sales|legal|other\"}],\"hasTasks\":true|false}. Keep task text short and actionable.",
                      },
                      { role: "user", content: `From: ${scannedEmail.from.name || ""} <${scannedEmail.from.address}>\nSubject: ${scannedEmail.subject}\n\n${emailText.substring(0, 1500)}` },
                    ],
                  });
                  const text = typeof response.choices?.[0]?.message?.content === "string" ? response.choices[0].message.content : "";
                  try {
                    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
                    if (parsed.hasTasks && parsed.actionItems?.length > 0) {
                      const db = await import("../db");
                      for (const item of parsed.actionItems) {
                        try {
                          const domain = normalizeEmailTaskDomain(item.domain);
                          if (!domain || !ALLOWED_EMAIL_TASK_DOMAINS.has(domain)) continue;

                          const routing = await routeSuggestedTaskToProject({
                            task: item.task,
                            domain,
                            fromAddress: scannedEmail.from.address,
                            subject: scannedEmail.subject,
                          });
                          if (!routing.projectId) continue;

                          const taskPayload = {
                            action: "create_project_task",
                            projectId: routing.projectId,
                            name: item.task,
                            description: `From: ${scannedEmail.from.name || scannedEmail.from.address} — ${scannedEmail.subject}`,
                            priority: normalizeTaskPriority(item.priority),
                            assigneeId: routing.assigneeId,
                            source: "email_scan",
                            sourceEmail: {
                              from: scannedEmail.from.address,
                              subject: scannedEmail.subject,
                              messageId: scannedEmail.messageId,
                            },
                            domain,
                          };

                          const suggestedTask = await db.createAiAgentTask({
                            taskType: "query" as any,
                            priority: normalizeTaskPriority(item.priority),
                            status: "pending_approval",
                            taskData: JSON.stringify(taskPayload),
                            aiReasoning: `Suggested ${domain} task extracted from inbound email`,
                            aiConfidence: "78.00",
                            relatedEntityType: "project",
                            relatedEntityId: routing.projectId,
                            requiresApproval: true,
                          } as any);

                          await db.createAiAgentLog?.({
                            taskId: suggestedTask.id,
                            action: "email_task_suggested",
                            status: "info",
                            message: `Email task queued for approval: ${item.task}`,
                            details: JSON.stringify(taskPayload),
                          } as any);
                        } catch { /* skip */ }
                      }
                    }
                  } catch { /* JSON parse failed */ }
                }
              } catch { /* AI extraction failed */ }
            }
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
              const part = await client.download(uid.toString(), String(partIndex), { uid: true });
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
