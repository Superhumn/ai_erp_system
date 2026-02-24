/**
 * Shortwave-Style AI Email Service
 *
 * Implements the core AI email features inspired by Shortwave:
 * - Instant thread summaries
 * - Ghostwriter (AI email composition matching user's style)
 * - AI-powered search & Q&A over email history
 * - Smart label auto-classification
 * - Inbox organization suggestions
 * - Email-to-todo extraction
 */

import { invokeLLM } from "./_core/llm";
import * as db from "./db";

// ============================================
// THREAD SUMMARIZATION
// ============================================

export interface ThreadSummaryResult {
  summary: string;
  keyTakeaways: string[];
  actionItems: Array<{ text: string; assignee?: string; dueDate?: string }>;
  participants: Array<{ name: string; email: string; messageCount: number }>;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
}

/**
 * Generate an instant AI summary of an email thread
 */
export async function summarizeThread(
  emails: Array<{
    from: string;
    fromName?: string;
    subject: string;
    bodyText: string;
    date: string;
  }>
): Promise<ThreadSummaryResult> {
  const threadContent = emails
    .map(
      (e, i) =>
        `--- Message ${i + 1} (${e.date}) ---\nFrom: ${e.fromName || e.from}\nSubject: ${e.subject}\n\n${e.bodyText?.substring(0, 2000) || "(empty)"}`
    )
    .join("\n\n");

  const participantMap = new Map<string, { name: string; count: number }>();
  for (const e of emails) {
    const key = e.from.toLowerCase();
    const existing = participantMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      participantMap.set(key, { name: e.fromName || e.from, count: 1 });
    }
  }

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an email thread summarizer. Provide concise, actionable summaries that help busy professionals quickly understand email threads without reading every message.

Your summaries should:
1. Lead with the most important conclusion or decision
2. Highlight any action items or deadlines
3. Note key changes or updates from the thread
4. Be 2-3 sentences maximum for the main summary
5. Extract specific action items with assignees when mentioned`,
      },
      {
        role: "user",
        content: `Summarize this email thread with ${emails.length} messages:\n\n${threadContent}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "thread_summary",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: {
              type: "string",
              description: "2-3 sentence summary of the thread",
            },
            keyTakeaways: {
              type: "array",
              items: { type: "string" },
              description: "3-5 bullet point takeaways",
            },
            actionItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  assignee: { type: "string" },
                  dueDate: { type: "string" },
                },
                required: ["text", "assignee", "dueDate"],
                additionalProperties: false,
              },
            },
            sentiment: {
              type: "string",
              enum: ["positive", "neutral", "negative", "mixed"],
            },
          },
          required: ["summary", "keyTakeaways", "actionItems", "sentiment"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Failed to summarize thread");
  }

  const parsed = JSON.parse(content);
  return {
    ...parsed,
    participants: Array.from(participantMap.entries()).map(([email, data]) => ({
      name: data.name,
      email,
      messageCount: data.count,
    })),
  };
}

// ============================================
// GHOSTWRITER - AI EMAIL COMPOSITION
// ============================================

export interface GhostwriterResult {
  subject: string;
  body: string;
  tone: string;
  styleMatchScore: number;
  alternatives: Array<{ body: string; tone: string }>;
}

/**
 * Analyze a user's sent emails to learn their writing style
 */
export async function learnWritingStyle(
  sentEmails: Array<{ subject: string; body: string }>
): Promise<{
  toneProfile: Record<string, number>;
  commonPhrases: string[];
  greetingStyle: string;
  closingStyle: string;
  averageSentenceLength: number;
  vocabularyLevel: string;
  useEmoji: boolean;
}> {
  const sampleText = sentEmails
    .slice(0, 20)
    .map((e) => `Subject: ${e.subject}\n${e.body?.substring(0, 500) || ""}`)
    .join("\n---\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a writing style analyst. Analyze the following email samples to build a comprehensive writing style profile. Focus on:
- Tone characteristics (formality 0-1, friendliness 0-1, verbosity 0-1, directness 0-1)
- Common phrases, greetings, and sign-offs
- Sentence structure and length
- Vocabulary complexity
- Emoji usage`,
      },
      {
        role: "user",
        content: `Analyze the writing style from these ${sentEmails.length} email samples:\n\n${sampleText}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "writing_style",
        strict: true,
        schema: {
          type: "object",
          properties: {
            toneProfile: {
              type: "object",
              properties: {
                formality: { type: "number" },
                friendliness: { type: "number" },
                verbosity: { type: "number" },
                directness: { type: "number" },
              },
              required: ["formality", "friendliness", "verbosity", "directness"],
              additionalProperties: false,
            },
            commonPhrases: {
              type: "array",
              items: { type: "string" },
            },
            greetingStyle: { type: "string" },
            closingStyle: { type: "string" },
            averageSentenceLength: { type: "number" },
            vocabularyLevel: { type: "string" },
            useEmoji: { type: "boolean" },
          },
          required: [
            "toneProfile",
            "commonPhrases",
            "greetingStyle",
            "closingStyle",
            "averageSentenceLength",
            "vocabularyLevel",
            "useEmoji",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Failed to analyze writing style");
  }

  return JSON.parse(content);
}

/**
 * Generate an email draft using Ghostwriter (matches user's style)
 */
export async function ghostwriteEmail(params: {
  prompt: string;
  context?: {
    replyToSubject?: string;
    replyToBody?: string;
    replyToFrom?: string;
    threadSummary?: string;
  };
  styleProfile?: {
    toneProfile?: Record<string, number>;
    commonPhrases?: string[];
    greetingStyle?: string;
    closingStyle?: string;
    vocabularyLevel?: string;
    useEmoji?: boolean;
  };
  recipientName?: string;
  recipientEmail?: string;
}): Promise<GhostwriterResult> {
  const { prompt, context, styleProfile, recipientName } = params;

  let styleInstructions = "";
  if (styleProfile) {
    const tone = styleProfile.toneProfile || {};
    styleInstructions = `
WRITING STYLE TO MATCH:
- Formality: ${tone.formality ?? 0.7}/1.0
- Friendliness: ${tone.friendliness ?? 0.6}/1.0
- Verbosity: ${tone.verbosity ?? 0.4}/1.0 (${(tone.verbosity ?? 0.4) < 0.3 ? "very concise" : (tone.verbosity ?? 0.4) < 0.6 ? "moderate length" : "detailed"})
- Directness: ${tone.directness ?? 0.7}/1.0
- Vocabulary: ${styleProfile.vocabularyLevel || "moderate"}
- Emoji usage: ${styleProfile.useEmoji ? "yes, occasionally" : "no"}
- Typical greeting: "${styleProfile.greetingStyle || "Hi"}"
- Typical closing: "${styleProfile.closingStyle || "Best regards"}"
${styleProfile.commonPhrases?.length ? `- Common phrases to incorporate naturally: ${styleProfile.commonPhrases.slice(0, 5).join(", ")}` : ""}`;
  }

  let contextInfo = "";
  if (context?.replyToBody) {
    contextInfo = `
REPLYING TO:
From: ${context.replyToFrom || "Unknown"}
Subject: ${context.replyToSubject || ""}
Body: ${context.replyToBody.substring(0, 3000)}
${context.threadSummary ? `\nThread Summary: ${context.threadSummary}` : ""}`;
  }

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are Ghostwriter, an AI email composer that writes emails matching the user's personal style. Your emails should feel like the user wrote them personally - not like generic AI output.
${styleInstructions}

Write naturally, avoiding corporate jargon unless the style profile indicates high formality. Never include placeholder brackets like [name] - use the actual information provided.`,
      },
      {
        role: "user",
        content: `Write an email based on this instruction: "${prompt}"
${recipientName ? `\nRecipient: ${recipientName}` : ""}
${contextInfo}

Generate the email with a subject line and body. Also provide two alternative versions with different tones.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ghostwriter_result",
        strict: true,
        schema: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
            tone: { type: "string" },
            styleMatchScore: {
              type: "number",
              description: "0-100 how well this matches the style profile",
            },
            alternatives: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  body: { type: "string" },
                  tone: { type: "string" },
                },
                required: ["body", "tone"],
                additionalProperties: false,
              },
            },
          },
          required: ["subject", "body", "tone", "styleMatchScore", "alternatives"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Failed to generate email");
  }

  return JSON.parse(content);
}

// ============================================
// AI SEARCH & Q&A
// ============================================

export interface EmailSearchResult {
  answer: string;
  relevantEmails: Array<{
    emailId: number;
    subject: string;
    from: string;
    date: string;
    relevanceScore: number;
    snippet: string;
  }>;
  followUpQuestions: string[];
}

/**
 * AI-powered search and Q&A over email history
 * Answers questions like "What was the last price quote from Vendor X?"
 */
export async function searchEmailsWithAI(
  query: string,
  emails: Array<{
    id: number;
    from: string;
    fromName?: string;
    subject: string;
    bodyText: string;
    date: string;
    category?: string;
  }>
): Promise<EmailSearchResult> {
  const emailContext = emails
    .slice(0, 30)
    .map(
      (e) =>
        `[ID:${e.id}] From: ${e.fromName || e.from} | Subject: ${e.subject} | Date: ${e.date} | Category: ${e.category || "general"}\nBody: ${e.bodyText?.substring(0, 500) || "(empty)"}`
    )
    .join("\n\n---\n\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an AI email search assistant. Users ask questions about their email history and you provide direct answers based on the email data, not just links to emails.

For factual questions, give a direct answer first, then cite the relevant emails.
For searches, rank results by relevance and explain why each is relevant.
Always suggest follow-up questions the user might want to ask.`,
      },
      {
        role: "user",
        content: `Question: "${query}"\n\nEmail history to search:\n${emailContext}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "email_search",
        strict: true,
        schema: {
          type: "object",
          properties: {
            answer: {
              type: "string",
              description: "Direct answer to the question",
            },
            relevantEmails: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  emailId: { type: "number" },
                  subject: { type: "string" },
                  from: { type: "string" },
                  date: { type: "string" },
                  relevanceScore: { type: "number" },
                  snippet: { type: "string" },
                },
                required: ["emailId", "subject", "from", "date", "relevanceScore", "snippet"],
                additionalProperties: false,
              },
            },
            followUpQuestions: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["answer", "relevantEmails", "followUpQuestions"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Failed to search emails");
  }

  return JSON.parse(content);
}

// ============================================
// SMART LABELS
// ============================================

/**
 * Auto-classify an email and suggest smart labels
 */
export async function suggestSmartLabels(
  email: {
    from: string;
    subject: string;
    bodyText: string;
  },
  existingLabels: Array<{ id: number; name: string; matchRules?: any }>
): Promise<
  Array<{ labelId: number; labelName: string; confidence: number; reason: string }>
> {
  // First try rule-based matching
  const ruleMatches: Array<{
    labelId: number;
    labelName: string;
    confidence: number;
    reason: string;
  }> = [];

  for (const label of existingLabels) {
    if (!label.matchRules) continue;
    const rules = label.matchRules as {
      senderPatterns?: string[];
      subjectPatterns?: string[];
      bodyKeywords?: string[];
      domains?: string[];
    };

    let matched = false;
    let reason = "";

    if (rules.domains?.length) {
      const domain = email.from.split("@")[1]?.toLowerCase();
      if (domain && rules.domains.some((d: string) => domain.includes(d.toLowerCase()))) {
        matched = true;
        reason = `Sender domain matches`;
      }
    }

    if (rules.subjectPatterns?.length) {
      const subjectLower = email.subject.toLowerCase();
      if (rules.subjectPatterns.some((p: string) => subjectLower.includes(p.toLowerCase()))) {
        matched = true;
        reason = `Subject matches pattern`;
      }
    }

    if (rules.bodyKeywords?.length) {
      const bodyLower = (email.bodyText || "").toLowerCase();
      if (rules.bodyKeywords.some((k: string) => bodyLower.includes(k.toLowerCase()))) {
        matched = true;
        reason = reason || `Body contains keyword`;
      }
    }

    if (matched) {
      ruleMatches.push({
        labelId: label.id,
        labelName: label.name,
        confidence: 85,
        reason,
      });
    }
  }

  // If we got rule matches, return those
  if (ruleMatches.length > 0) {
    return ruleMatches;
  }

  // Otherwise use AI classification
  const labelList = existingLabels.map((l) => `${l.id}: ${l.name}`).join(", ");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an email label classifier. Given an email, suggest which labels should be applied from the available labels. Only suggest labels that genuinely apply.`,
      },
      {
        role: "user",
        content: `Available labels: ${labelList}

Email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.bodyText?.substring(0, 2000) || "(empty)"}

Which labels apply?`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "label_suggestions",
        strict: true,
        schema: {
          type: "object",
          properties: {
            labels: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  labelId: { type: "number" },
                  labelName: { type: "string" },
                  confidence: { type: "number" },
                  reason: { type: "string" },
                },
                required: ["labelId", "labelName", "confidence", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["labels"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") return [];

  const parsed = JSON.parse(content);
  return parsed.labels || [];
}

// ============================================
// INBOX ORGANIZATION
// ============================================

export interface InboxOrganizationSuggestion {
  type: "archive" | "bundle" | "label" | "todo" | "unsubscribe" | "snooze";
  emailIds: number[];
  description: string;
  reason: string;
  confidence: number;
}

/**
 * "Organize My Inbox" - scans recent emails and suggests bulk actions
 */
export async function organizeInbox(
  emails: Array<{
    id: number;
    from: string;
    fromName?: string;
    subject: string;
    bodyText: string;
    date: string;
    category?: string;
    isRead?: boolean;
  }>
): Promise<InboxOrganizationSuggestion[]> {
  const emailList = emails
    .slice(0, 50)
    .map(
      (e) =>
        `[ID:${e.id}] From: ${e.fromName || e.from} | Subject: ${e.subject} | Date: ${e.date} | Read: ${e.isRead ? "yes" : "no"} | Category: ${e.category || "?"}`
    )
    .join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an inbox organization assistant. Analyze the user's inbox and suggest bulk actions to help them reach inbox zero. Group similar actions together.

Action types:
- archive: Old read emails or newsletters that don't need action
- bundle: Group related emails from same sender/topic
- label: Suggest categorization for uncategorized emails
- todo: Emails that contain action items the user should track
- unsubscribe: Promotional emails the user may want to unsubscribe from
- snooze: Emails that aren't urgent now but need attention later`,
      },
      {
        role: "user",
        content: `Here are my recent emails. Suggest organization actions:\n\n${emailList}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "inbox_organization",
        strict: true,
        schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["archive", "bundle", "label", "todo", "unsubscribe", "snooze"],
                  },
                  emailIds: {
                    type: "array",
                    items: { type: "number" },
                  },
                  description: { type: "string" },
                  reason: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["type", "emailIds", "description", "reason", "confidence"],
                additionalProperties: false,
              },
            },
          },
          required: ["suggestions"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") return [];

  const parsed = JSON.parse(content);
  return parsed.suggestions || [];
}

// ============================================
// EMAIL TODO EXTRACTION
// ============================================

/**
 * Extract action items / todos from an email
 */
export async function extractEmailTodos(email: {
  from: string;
  subject: string;
  bodyText: string;
}): Promise<
  Array<{
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    dueDate?: string;
    confidence: number;
  }>
> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a task extraction assistant. Analyze emails and extract any action items, tasks, or to-dos that require follow-up. Only extract genuine action items, not informational content.

For each action item:
- Create a clear, actionable title
- Provide brief context
- Assess priority based on urgency/importance
- Extract any mentioned deadlines`,
      },
      {
        role: "user",
        content: `Extract action items from this email:

From: ${email.from}
Subject: ${email.subject}

${email.bodyText?.substring(0, 4000) || "(empty)"}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "email_todos",
        strict: true,
        schema: {
          type: "object",
          properties: {
            todos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "string", enum: ["high", "medium", "low"] },
                  dueDate: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["title", "description", "priority", "dueDate", "confidence"],
                additionalProperties: false,
              },
            },
          },
          required: ["todos"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") return [];

  const parsed = JSON.parse(content);
  return parsed.todos || [];
}

// ============================================
// EMAIL TRANSLATION
// ============================================

/**
 * Translate an email to/from any language
 */
export async function translateEmail(
  text: string,
  targetLanguage: string
): Promise<{ translated: string; sourceLanguage: string }> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a professional email translator. Translate the email while preserving the original tone, formatting, and intent. Detect the source language automatically.`,
      },
      {
        role: "user",
        content: `Translate the following email to ${targetLanguage}:\n\n${text}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "translation",
        strict: true,
        schema: {
          type: "object",
          properties: {
            translated: { type: "string" },
            sourceLanguage: { type: "string" },
          },
          required: ["translated", "sourceLanguage"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Failed to translate email");
  }

  return JSON.parse(content);
}
