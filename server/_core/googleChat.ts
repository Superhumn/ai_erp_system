/**
 * Google Chat Integration Service
 *
 * Integrates with the Google Chat API to:
 * - List spaces the bot/user belongs to
 * - Read messages from spaces
 * - Send messages to spaces
 * - Extract tasks/action items from chat messages using AI
 *
 * Requires Google Chat API scope: https://www.googleapis.com/auth/chat.spaces.readonly
 * and https://www.googleapis.com/auth/chat.messages
 *
 * Uses the Google Chat REST API v1: https://developers.google.com/workspace/chat/api/reference/rest
 */

import { ENV } from "./env";

const CHAT_API = "https://chat.googleapis.com/v1";

// Google Chat types

export interface GoogleChatSpace {
  name: string; // e.g., "spaces/AAAA"
  type: "ROOM" | "DM" | "GROUP_CHAT";
  displayName: string;
  spaceThreadingState?: "THREADED_MESSAGES" | "GROUPED_MESSAGES" | "UNTHREADED_MESSAGES";
  singleUserBotDm?: boolean;
  spaceType?: string;
}

export interface GoogleChatUser {
  name: string;
  displayName: string;
  domainId?: string;
  type: "HUMAN" | "BOT";
  isAnonymous?: boolean;
}

export interface GoogleChatMessage {
  name: string; // e.g., "spaces/AAAA/messages/BBBB"
  sender: GoogleChatUser;
  createTime: string; // RFC 3339 timestamp
  text: string;
  thread?: {
    name: string;
  };
  space?: GoogleChatSpace;
  argumentText?: string;
  annotations?: Array<{
    type: string;
    startIndex?: number;
    length?: number;
    userMention?: { user: GoogleChatUser; type: string };
  }>;
}

export interface GoogleChatListMessagesResult {
  messages: GoogleChatMessage[];
  nextPageToken?: string;
}

export interface GoogleChatListSpacesResult {
  spaces: GoogleChatSpace[];
  nextPageToken?: string;
}

export interface ExtractedChatTask {
  text: string;
  assignee?: string;
  assigneeEmail?: string;
  dueDate?: string;
  priority: "low" | "medium" | "high" | "critical";
  sourceMessage: string;
  sourceSpace: string;
  senderName: string;
  messageTimestamp: string;
}

/**
 * Get OAuth URL for Google Chat access
 */
export function getGoogleChatAuthUrl(userId: number): string {
  const clientId = ENV.googleClientId;
  const redirectUri = ENV.googleRedirectUri || `${ENV.appUrl}/api/oauth/google/callback`;

  const scope = encodeURIComponent(
    "https://www.googleapis.com/auth/chat.spaces.readonly " +
    "https://www.googleapis.com/auth/chat.messages.readonly " +
    "https://www.googleapis.com/auth/chat.messages.create"
  );

  const state = `gchat_${userId}`;

  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
}

/**
 * List spaces the authenticated user belongs to
 */
export async function listSpaces(
  accessToken: string,
  pageSize: number = 100,
  pageToken?: string
): Promise<{ success: boolean; result?: GoogleChatListSpacesResult; error?: string }> {
  try {
    const params = new URLSearchParams();
    params.append("pageSize", pageSize.toString());
    if (pageToken) params.append("pageToken", pageToken);

    const response = await fetch(`${CHAT_API}/spaces?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[GoogleChat] Failed to list spaces:", error);
      return { success: false, error: `Failed to list spaces: ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      result: {
        spaces: data.spaces || [],
        nextPageToken: data.nextPageToken,
      },
    };
  } catch (error: any) {
    console.error("[GoogleChat] Error listing spaces:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get a specific space by name
 */
export async function getSpace(
  accessToken: string,
  spaceName: string
): Promise<{ success: boolean; space?: GoogleChatSpace; error?: string }> {
  try {
    const response = await fetch(`${CHAT_API}/${spaceName}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[GoogleChat] Failed to get space:", error);
      return { success: false, error: `Failed to get space: ${response.status}` };
    }

    const space = await response.json();
    return { success: true, space };
  } catch (error: any) {
    console.error("[GoogleChat] Error getting space:", error);
    return { success: false, error: error.message };
  }
}

/**
 * List messages in a space
 */
export async function listMessages(
  accessToken: string,
  spaceName: string,
  options: {
    pageSize?: number;
    pageToken?: string;
    filter?: string; // e.g., 'createTime > "2023-01-01T00:00:00Z"'
    orderBy?: string;
    showDeleted?: boolean;
  } = {}
): Promise<{ success: boolean; result?: GoogleChatListMessagesResult; error?: string }> {
  try {
    const params = new URLSearchParams();
    params.append("pageSize", (options.pageSize || 100).toString());
    if (options.pageToken) params.append("pageToken", options.pageToken);
    if (options.filter) params.append("filter", options.filter);
    if (options.orderBy) params.append("orderBy", options.orderBy);
    if (options.showDeleted) params.append("showDeleted", "true");

    const response = await fetch(`${CHAT_API}/${spaceName}/messages?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[GoogleChat] Failed to list messages:", error);
      return { success: false, error: `Failed to list messages: ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      result: {
        messages: data.messages || [],
        nextPageToken: data.nextPageToken,
      },
    };
  } catch (error: any) {
    console.error("[GoogleChat] Error listing messages:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a message to a Google Chat space
 */
export async function sendMessage(
  accessToken: string,
  spaceName: string,
  text: string,
  threadName?: string
): Promise<{ success: boolean; message?: GoogleChatMessage; error?: string }> {
  try {
    const body: any = { text };
    if (threadName) {
      body.thread = { name: threadName };
    }

    const response = await fetch(`${CHAT_API}/${spaceName}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[GoogleChat] Failed to send message:", error);
      return { success: false, error: `Failed to send message: ${response.status}` };
    }

    const message = await response.json();
    return { success: true, message };
  } catch (error: any) {
    console.error("[GoogleChat] Error sending message:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Extract task-like content from chat messages using pattern matching.
 * Looks for common task indicators: TODO, action item, @mentions with requests, deadlines, etc.
 */
export function extractTasksFromMessages(messages: GoogleChatMessage[]): ExtractedChatTask[] {
  const tasks: ExtractedChatTask[] = [];

  const taskPatterns = [
    // "TODO: something" or "TODO something"
    /(?:TODO|To-?Do)[:\s]+(.+)/i,
    // "Action item: something"
    /(?:action item|action)[:\s]+(.+)/i,
    // "Task: something"
    /(?:task)[:\s]+(.+)/i,
    // "Please do X" / "Can you do X" / "Need to do X"
    /(?:please|can you|need to|needs to|should|must|have to)\s+(.{10,})/i,
    // "Follow up on X" / "Follow-up: X"
    /(?:follow[- ]?up(?:\s+on)?)[:\s]+(.+)/i,
    // "Reminder: X"
    /(?:reminder)[:\s]+(.+)/i,
    // "Deadline: X" or "Due by X"
    /(?:deadline|due by|due date)[:\s]+(.+)/i,
    // "[ACTION] something" or "[TODO] something"
    /\[(?:ACTION|TODO|TASK|FOLLOW[- ]?UP)\]\s*(.+)/i,
  ];

  const assigneePatterns = [
    /@(\w+(?:\s\w+)?)/,                                  // @John or @John Smith
    /(?:assigned to|assign to|assigning to)\s+(\w+(?:\s\w+)?)/i,
    /(\w+(?:\s\w+)?)\s*(?:please|will|can you|should)/i,
  ];

  const dueDatePatterns = [
    /(?:by|before|due|deadline)\s+(\w+\s+\d{1,2}(?:,?\s*\d{4})?)/i,
    /(?:by|before|due)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|end of (?:day|week|month))/i,
    /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
  ];

  const priorityKeywords: Record<string, "critical" | "high" | "medium" | "low"> = {
    urgent: "critical",
    asap: "critical",
    critical: "critical",
    "high priority": "high",
    important: "high",
    "low priority": "low",
    "when you get a chance": "low",
    "no rush": "low",
  };

  for (const msg of messages) {
    if (!msg.text) continue;

    // Check each line for task patterns
    const lines = msg.text.split("\n");
    for (const line of lines) {
      for (const pattern of taskPatterns) {
        const match = line.match(pattern);
        if (match) {
          const taskText = match[1].trim();
          if (taskText.length < 5) continue; // Skip very short matches

          const task: ExtractedChatTask = {
            text: taskText,
            priority: "medium",
            sourceMessage: msg.name,
            sourceSpace: msg.space?.name || "",
            senderName: msg.sender?.displayName || "Unknown",
            messageTimestamp: msg.createTime,
          };

          // Try to extract assignee
          for (const aPattern of assigneePatterns) {
            const aMatch = line.match(aPattern);
            if (aMatch) {
              task.assignee = aMatch[1].trim();
              break;
            }
          }

          // Extract from @mentions in annotations
          if (msg.annotations) {
            const userMention = msg.annotations.find(
              (a) => a.type === "USER_MENTION" && a.userMention
            );
            if (userMention?.userMention) {
              task.assignee = userMention.userMention.user.displayName;
            }
          }

          // Try to extract due date
          for (const dPattern of dueDatePatterns) {
            const dMatch = line.match(dPattern);
            if (dMatch) {
              task.dueDate = dMatch[1].trim();
              break;
            }
          }

          // Determine priority
          const lineLower = line.toLowerCase();
          for (const [keyword, level] of Object.entries(priorityKeywords)) {
            if (lineLower.includes(keyword)) {
              task.priority = level;
              break;
            }
          }

          tasks.push(task);
          break; // Only match first pattern per line
        }
      }
    }
  }

  return tasks;
}

/**
 * AI-powered task extraction from chat messages using LLM.
 * Falls back to pattern matching if LLM is unavailable.
 */
export async function extractTasksWithAI(
  messages: GoogleChatMessage[]
): Promise<ExtractedChatTask[]> {
  try {
    const { invokeLLM } = await import("./llm");

    // Build a concise message log for LLM analysis
    const messageLog = messages
      .map((m) => `[${m.createTime}] ${m.sender?.displayName || "Unknown"}: ${m.text}`)
      .join("\n");

    const prompt = `Analyze the following Google Chat conversation and extract any tasks, action items, or follow-ups. Only extract actual tasks — not general discussion.

MESSAGES:
${messageLog.substring(0, 8000)}

For each task found, return:
- text: The task description
- assignee: Who should do it (if mentioned)
- dueDate: When it's due (if mentioned), in YYYY-MM-DD format
- priority: low, medium, high, or critical
- senderName: Who assigned/mentioned the task

Return JSON:
{
  "tasks": [
    {
      "text": "task description",
      "assignee": "person name or null",
      "dueDate": "YYYY-MM-DD or null",
      "priority": "medium",
      "senderName": "who said it"
    }
  ]
}

If no tasks found, return: {"tasks": []}`;

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You extract actionable tasks from chat conversations. Always respond with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "chat_tasks",
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
                    assignee: { type: "string" },
                    dueDate: { type: "string" },
                    priority: { type: "string" },
                    senderName: { type: "string" },
                  },
                  required: ["text", "priority", "senderName"],
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
      return extractTasksFromMessages(messages);
    }

    const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    const firstMsg = messages[0];

    return (parsed.tasks || []).map((t: any) => ({
      text: t.text,
      assignee: t.assignee || undefined,
      dueDate: t.dueDate || undefined,
      priority: ["low", "medium", "high", "critical"].includes(t.priority)
        ? t.priority
        : "medium",
      sourceMessage: firstMsg?.name || "",
      sourceSpace: firstMsg?.space?.name || "",
      senderName: t.senderName || "Unknown",
      messageTimestamp: firstMsg?.createTime || new Date().toISOString(),
    }));
  } catch (error) {
    console.error("[GoogleChat] AI task extraction failed, falling back to patterns:", error);
    return extractTasksFromMessages(messages);
  }
}

/**
 * Validate Google Chat access by listing spaces
 */
export async function validateGoogleChatAccess(
  accessToken: string
): Promise<{ valid: boolean; spacesCount?: number; error?: string }> {
  const result = await listSpaces(accessToken, 1);
  if (result.success) {
    return { valid: true, spacesCount: result.result?.spaces.length || 0 };
  }
  return { valid: false, error: result.error };
}
