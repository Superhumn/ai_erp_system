/**
 * Email-to-Task Extraction Service
 *
 * Analyzes inbound emails and extracts actionable tasks using both
 * pattern matching and AI. Creates project tasks automatically from
 * email content like action requests, follow-ups, deadlines, etc.
 *
 * Works with the existing emailParser categorization and inbound email system.
 */

import { invokeLLM } from "./llm";
import type { EmailCategory, EmailCategorization } from "./emailParser";

export interface ExtractedEmailTask {
  text: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  dueDate?: string;
  assignee?: string;
  sourceEmailId: number;
  sourceSubject: string;
  sourceFrom: string;
  category: EmailCategory;
  confidence: number;
}

export interface EmailTaskExtractionResult {
  success: boolean;
  tasks: ExtractedEmailTask[];
  error?: string;
}

/**
 * Map email categories to task priorities and suggested task names
 */
const CATEGORY_TASK_MAP: Record<
  EmailCategory,
  { defaultPriority: "low" | "medium" | "high" | "critical"; taskPrefix: string; autoCreate: boolean }
> = {
  invoice: { defaultPriority: "high", taskPrefix: "Review & pay invoice", autoCreate: true },
  purchase_order: { defaultPriority: "high", taskPrefix: "Process purchase order", autoCreate: true },
  shipping_confirmation: { defaultPriority: "medium", taskPrefix: "Track shipment", autoCreate: true },
  freight_quote: { defaultPriority: "medium", taskPrefix: "Review freight quote", autoCreate: true },
  delivery_notification: { defaultPriority: "high", taskPrefix: "Confirm delivery & update inventory", autoCreate: true },
  order_confirmation: { defaultPriority: "low", taskPrefix: "Verify order details", autoCreate: false },
  payment_confirmation: { defaultPriority: "medium", taskPrefix: "Reconcile payment", autoCreate: true },
  receipt: { defaultPriority: "low", taskPrefix: "File receipt", autoCreate: false },
  general: { defaultPriority: "medium", taskPrefix: "Review email", autoCreate: false },
};

/**
 * Quick task extraction using pattern matching (no AI call).
 * Creates tasks based on email category and content patterns.
 */
export function quickExtractTasks(
  emailId: number,
  subject: string,
  bodyText: string,
  fromEmail: string,
  fromName: string | undefined,
  categorization: EmailCategorization
): ExtractedEmailTask[] {
  const tasks: ExtractedEmailTask[] = [];
  const categoryConfig = CATEGORY_TASK_MAP[categorization.category];

  // Create a category-based task if the category warrants auto-creation
  if (categoryConfig.autoCreate) {
    const fromDisplay = fromName ? `${fromName} (${fromEmail})` : fromEmail;
    tasks.push({
      text: `${categoryConfig.taskPrefix}: ${subject}`.substring(0, 255),
      description: `Auto-created from email\n\nFrom: ${fromDisplay}\nSubject: ${subject}\n\nSuggested action: ${categorization.suggestedAction || categoryConfig.taskPrefix}`,
      priority: categorization.priority === "high" ? "high" : categoryConfig.defaultPriority,
      sourceEmailId: emailId,
      sourceSubject: subject,
      sourceFrom: fromEmail,
      category: categorization.category,
      confidence: categorization.confidence,
    });
  }

  // Scan body for explicit task indicators
  const bodyLines = bodyText.split("\n");
  const taskPatterns = [
    /(?:action required|action needed)[:\s]*(.+)/i,
    /(?:please|kindly)\s+(?:review|approve|confirm|process|sign|complete|submit|send|update|check)\s+(.+)/i,
    /(?:deadline|due date|due by)[:\s]*(.+)/i,
    /(?:follow[- ]?up)[:\s]*(.+)/i,
    /(?:reminder|urgent|asap)[:\s]*(.+)/i,
    /\[(?:ACTION|TODO|TASK)\]\s*(.+)/i,
  ];

  const dueDatePatterns = [
    /(?:by|before|due|deadline)\s+(\w+\s+\d{1,2}(?:,?\s*\d{4})?)/i,
    /(?:by|before|due)\s+(today|tomorrow|end of (?:day|week|month)|next (?:monday|tuesday|wednesday|thursday|friday|week))/i,
    /(\d{4}-\d{2}-\d{2})/,
  ];

  for (const line of bodyLines) {
    for (const pattern of taskPatterns) {
      const match = line.match(pattern);
      if (match && match[1].trim().length >= 10) {
        const taskText = match[1].trim().substring(0, 255);

        // Avoid duplicating the category-based task
        if (tasks.some((t) => t.text.includes(taskText.substring(0, 30)))) continue;

        const task: ExtractedEmailTask = {
          text: taskText,
          description: `Extracted from email body\n\nFrom: ${fromEmail}\nSubject: ${subject}\n\nContext: ${line.trim()}`,
          priority: categorization.priority === "high" ? "high" : "medium",
          sourceEmailId: emailId,
          sourceSubject: subject,
          sourceFrom: fromEmail,
          category: categorization.category,
          confidence: 65,
        };

        // Try to find due date in surrounding context
        for (const dPattern of dueDatePatterns) {
          const dMatch = bodyText.match(dPattern);
          if (dMatch) {
            task.dueDate = dMatch[1].trim();
            break;
          }
        }

        tasks.push(task);
        break; // One task per line
      }
    }
  }

  return tasks;
}

/**
 * AI-powered task extraction from email content.
 * Uses LLM to deeply understand email context and extract tasks.
 */
export async function extractTasksWithAI(
  emailId: number,
  subject: string,
  bodyText: string,
  fromEmail: string,
  fromName: string | undefined,
  categorization: EmailCategorization
): Promise<EmailTaskExtractionResult> {
  try {
    const fromDisplay = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const prompt = `Analyze this business email and extract any actionable tasks, follow-ups, or items requiring action.

EMAIL:
From: ${fromDisplay}
Subject: ${subject}
Category: ${categorization.category} (confidence: ${categorization.confidence}%)
Priority: ${categorization.priority}

BODY (first 6000 chars):
${bodyText?.substring(0, 6000) || "(empty)"}

INSTRUCTIONS:
1. Extract specific, actionable tasks from the email content
2. For invoices: create a task to review and process payment
3. For POs: create a task to review and fulfill the order
4. For shipping: create a task to track and confirm delivery
5. For general emails with action requests: extract the specific asks
6. Determine priority based on urgency indicators
7. Extract any deadlines or due dates mentioned
8. Only extract genuine tasks — ignore greetings, signatures, disclaimers

Return JSON:
{
  "tasks": [
    {
      "text": "Short task title (max 255 chars)",
      "description": "Detailed description of what needs to be done",
      "priority": "low|medium|high|critical",
      "dueDate": "YYYY-MM-DD or null if not mentioned",
      "assignee": "Name if mentioned, null otherwise"
    }
  ]
}

If no actionable tasks, return: {"tasks": []}`;

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a business email analyst that extracts actionable tasks from emails. Always respond with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_tasks",
          strict: true,
          schema: {
            type: "object",
            properties: {
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    description: { type: "string" },
                    priority: { type: "string" },
                    dueDate: { type: "string" },
                    assignee: { type: "string" },
                  },
                  required: ["text", "description", "priority"],
                  additionalProperties: false,
                },
              },
            },
            required: ["tasks"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      // Fallback to pattern matching
      return {
        success: true,
        tasks: quickExtractTasks(emailId, subject, bodyText, fromEmail, fromName, categorization),
      };
    }

    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

    const tasks: ExtractedEmailTask[] = (parsed.tasks || []).map((t: any) => ({
      text: (t.text || "Review email").substring(0, 255),
      description: t.description || `From: ${fromDisplay}\nSubject: ${subject}`,
      priority: ["low", "medium", "high", "critical"].includes(t.priority) ? t.priority : "medium",
      dueDate: t.dueDate || undefined,
      assignee: t.assignee || undefined,
      sourceEmailId: emailId,
      sourceSubject: subject,
      sourceFrom: fromEmail,
      category: categorization.category,
      confidence: 85,
    }));

    return { success: true, tasks };
  } catch (error) {
    console.error("[EmailTaskExtractor] AI extraction failed, falling back to patterns:", error);
    return {
      success: true,
      tasks: quickExtractTasks(emailId, subject, bodyText, fromEmail, fromName, categorization),
    };
  }
}
