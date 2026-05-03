/**
 * Fireflies.ai GraphQL API Service
 *
 * Integrates with Fireflies.ai to fetch meeting transcripts, action items,
 * and participant data. Used to auto-generate project tasks, CRM contacts,
 * and projects from meeting content.
 *
 * API Docs: https://docs.fireflies.ai/graphql-api
 */

const FIREFLIES_API_URL = "https://api.fireflies.ai/graphql";

export interface FirefliesParticipant {
  displayName: string;
  email: string;
  name: string;
}

export interface FirefliesActionItem {
  text: string;
  assignee?: string;
  dueDate?: string;
}

export interface FirefliesSentence {
  text: string;
  speaker_name: string;
  start_time: number;
  end_time: number;
}

export interface FirefliesTranscript {
  id: string;
  title: string;
  date: number; // Unix timestamp ms
  duration: number; // seconds
  organizer_email: string;
  participants: string[];
  participant_emails?: string[]; // deprecated in Fireflies API
  summary?: {
    overview?: string;
    shorthand_bullet?: string[];
    action_items?: string[];
    keywords?: string[];
  };
  transcript_url?: string;
  sentences?: FirefliesSentence[];
  meeting_attendees?: FirefliesParticipant[];
  calendar_id?: string;
  audio_url?: string;
}

export interface FirefliesUser {
  user_id: string;
  email: string;
  name: string;
  integrations: string[];
  minutes_consumed: number;
  is_admin: boolean;
}

/**
 * Execute a GraphQL query against the Fireflies API
 */
async function firefliesQuery<T>(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(FIREFLIES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fireflies API error (${response.status}): ${text}`);
  }

  const data = await response.json();

  if (data.errors && data.errors.length > 0) {
    throw new Error(`Fireflies GraphQL error: ${data.errors.map((e: any) => e.message).join(", ")}`);
  }

  return data.data;
}

/**
 * Get the authenticated Fireflies user info
 */
export async function getFirefliesUser(apiKey: string): Promise<FirefliesUser> {
  const query = `
    query {
      user {
        user_id
        email
        name
        integrations
        minutes_consumed
        is_admin
      }
    }
  `;

  const data = await firefliesQuery<{ user: FirefliesUser }>(apiKey, query);
  return data.user;
}

/**
 * List recent transcripts from Fireflies. Supports a `toDate` cursor (Unix
 * ms) so callers can paginate backwards in time when `skip` is unreliable.
 */
export async function listTranscripts(
  apiKey: string,
  options: { limit?: number; skip?: number; toDate?: number } = {}
): Promise<FirefliesTranscript[]> {
  const limit = options.limit ?? 50;
  const skip = options.skip ?? 0;
  const toDate = options.toDate;
  const query = `
    query ListTranscripts($limit: Int, $skip: Int, $toDate: DateTime) {
      transcripts(limit: $limit, skip: $skip, toDate: $toDate) {
        id
        title
        date
        duration
        organizer_email
        participants

        summary {
          overview
          shorthand_bullet
          action_items
          keywords
        }
        transcript_url
        meeting_attendees {
          displayName
          email
          name
        }
        calendar_id
        audio_url
      }
    }
  `;

  const variables: Record<string, unknown> = { limit, skip };
  if (toDate != null) variables.toDate = new Date(toDate).toISOString();
  const data = await firefliesQuery<{ transcripts: FirefliesTranscript[] }>(apiKey, query, variables);
  return data.transcripts || [];
}

/**
 * Fetch transcripts from Fireflies using a date cursor.
 *
 * Fireflies caps `limit` at 50 and `skip` is unreliable past the first page,
 * so we paginate by `toDate`: each subsequent request asks for transcripts
 * older than the oldest one we just received. This works regardless of the
 * account plan and lets callers walk all the way back in history.
 *
 * Pass `untilDateMs` to stop once a transcript at or before that timestamp
 * is reached — useful for "fetch everything older than what we already have".
 */
export async function listAllTranscripts(
  apiKey: string,
  options: { pageSize?: number; maxItems?: number; untilDateMs?: number; startToDateMs?: number } = {},
): Promise<FirefliesTranscript[]> {
  const size = Math.max(1, Math.min(options.pageSize ?? 50, 50));
  const maxItems = options.maxItems ?? 2000;
  const untilDateMs = options.untilDateMs;
  const all: FirefliesTranscript[] = [];
  const seenIds = new Set<string>();

  let toDate: number | undefined = options.startToDateMs;
  let firstCall = true;
  while (true) {
    let page: FirefliesTranscript[] = [];
    try {
      page = await listTranscripts(apiKey, { limit: size, toDate });
    } catch (error: any) {
      if (firstCall) throw error;
      console.warn(`[Fireflies] Pagination stopped at toDate=${toDate}: ${error?.message || error}`);
      break;
    }
    firstCall = false;
    if (!page.length) break;

    let oldestInPage: number | undefined;
    let hitFloor = false;
    for (const item of page) {
      if (!item?.id || seenIds.has(item.id)) continue;
      const itemDate = typeof item.date === "number" ? item.date : Number(item.date) || 0;
      if (untilDateMs != null && itemDate <= untilDateMs) { hitFloor = true; continue; }
      seenIds.add(item.id);
      all.push(item);
      if (oldestInPage === undefined || itemDate < oldestInPage) oldestInPage = itemDate;
    }

    if (hitFloor) break;
    if (page.length < size) break;
    if (oldestInPage === undefined) break;
    // Step the cursor 1ms before the oldest item to avoid re-fetching it.
    const next = oldestInPage - 1;
    if (toDate !== undefined && next >= toDate) break; // no progress, stop
    toDate = next;
    if (all.length >= maxItems) break;
  }

  return all;
}

/**
 * Get a single transcript by ID with full details including sentences
 */
export async function getTranscript(apiKey: string, transcriptId: string): Promise<FirefliesTranscript | null> {
  const query = `
    query GetTranscript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        organizer_email
        participants

        summary {
          overview
          shorthand_bullet
          action_items
          keywords
        }
        transcript_url
        sentences {
          text
          speaker_name
          start_time
          end_time
        }
        meeting_attendees {
          displayName
          email
          name
        }
        calendar_id
        audio_url
      }
    }
  `;

  const data = await firefliesQuery<{ transcript: FirefliesTranscript | null }>(apiKey, query, { id: transcriptId });
  return data.transcript;
}

/**
 * Parse Fireflies action items from the summary into structured data.
 * Fireflies returns action items as plain strings - this attempts to extract
 * assignee names and due dates from natural language.
 */
export function parseActionItems(rawItems: unknown): FirefliesActionItem[] {
  // Strip embedded transcript timestamps in any of these shapes:
  //   (00:30)            single
  //   (1:23:45)          single with hours
  //   (00:30 - 01:45)    range
  //   * (00:00 - 10:46)  bullet-prefixed leading artifact
  //   - 08:40)           orphan closing fragment
  const TS = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
  const stripTimestamps = (s: string) =>
    s
      .replace(new RegExp(String.raw`\(\s*${TS}(?:\s*[-–]\s*${TS})?\s*\)`, "g"), " ")
      .replace(new RegExp(String.raw`(?:^|\s)[-–]\s*${TS}\s*\)`, "g"), " ")
      .replace(new RegExp(String.raw`(?:^|\s)\(\s*${TS}\s*[-–]\s*${TS}\s*(?=\s|$)`, "g"), " ")
      .replace(/^\s*[*•]\s+/, "")
      .replace(/\s+/g, " ")
      .trim();

  // Fireflies returns `summary.action_items` as a single markdown string
  // shaped like:
  //   **Speaker Name**
  //   - Do the thing (00:30)
  //   - Follow up next week (01:45)
  //
  //   **Other Speaker**
  //   - Send the deck
  // Parse into individual items, treating the bold header as the assignee.
  const itemsFromMarkdown = (raw: string): FirefliesActionItem[] => {
    const lines = raw.split(/\r?\n/);
    let currentAssignee: string | undefined;
    const out: FirefliesActionItem[] = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const headerMatch = line.match(/^\*\*(.+?)\*\*:?\s*$/);
      if (headerMatch) {
        currentAssignee = headerMatch[1].trim();
        continue;
      }
      // Accept "- text", "* text", "1. text", or a bare line
      const bulletMatch = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
      const text = stripTimestamps(bulletMatch ? bulletMatch[1] : line);
      if (!text) continue;
      const item: FirefliesActionItem = { text };
      if (currentAssignee) item.assignee = currentAssignee;
      out.push(item);
    }
    return out;
  };

  if (typeof rawItems === "string") {
    return rawItems.trim() ? itemsFromMarkdown(rawItems) : [];
  }

  const normalizedItems: string[] = Array.isArray(rawItems)
    ? rawItems
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            const candidate = (item as any).text ?? (item as any).action_item ?? (item as any).description;
            return typeof candidate === "string" ? candidate : "";
          }
          return "";
        })
        .filter((text) => text.trim().length > 0)
    : [];

  // If the array elements themselves contain markdown (one giant string per
  // entry, or "**Speaker**\n- item" blocks), defer to the markdown parser.
  if (normalizedItems.some((t) => /^\s*\*\*.+\*\*/m.test(t) || /\n\s*[-*•]/.test(t))) {
    return itemsFromMarkdown(normalizedItems.join("\n"));
  }

  return normalizedItems.map((rawText) => {
    const text = stripTimestamps(rawText);
    const item: FirefliesActionItem = { text };

    // Only match unambiguous assignee markers. The leading "Name:" pattern was
    // removed because it false-matches things like "Marketing: prepare deck".
    const assigneePatterns = [
      /@(\w+ ?\w*)/,                                  // "@John do something"
      /assigned to ([A-Z][a-z]+ ?[A-Z]?[a-z]*)/i,     // "assigned to John"
    ];

    for (const pattern of assigneePatterns) {
      const match = text.match(pattern);
      if (match) {
        item.assignee = match[1].trim();
        break;
      }
    }

    // Try to extract due dates
    const datePatterns = [
      /by (\w+ \d{1,2}(?:,? \d{4})?)/i,              // "by January 15, 2025"
      /due (\w+ \d{1,2}(?:,? \d{4})?)/i,              // "due March 1"
      /before (\w+ \d{1,2}(?:,? \d{4})?)/i,           // "before Friday"
      /deadline:? (\w+ \d{1,2}(?:,? \d{4})?)/i,       // "deadline: Jan 15"
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        item.dueDate = match[1].trim();
        break;
      }
    }

    return item;
  });
}

/**
 * Extract participant information from a Fireflies transcript.
 * Combines participants list and meeting_attendees for the most complete data.
 */
export function extractParticipants(transcript: FirefliesTranscript): Array<{ name: string; email: string }> {
  const participantMap = new Map<string, { name: string; email: string }>();

  // From meeting_attendees (most detailed)
  if (transcript.meeting_attendees) {
    for (const attendee of transcript.meeting_attendees) {
      const email = attendee.email?.toLowerCase();
      if (email) {
        participantMap.set(email, {
          name: attendee.displayName || attendee.name || email.split("@")[0],
          email,
        });
      }
    }
  }

  // From participants array (fallback — names or emails)
  if (transcript.participants) {
    for (const p of transcript.participants) {
      if (p && p.includes("@")) {
        const email = p.toLowerCase();
        if (!participantMap.has(email)) {
          participantMap.set(email, { name: email.split("@")[0], email });
        }
      }
    }
  }

  return Array.from(participantMap.values());
}

/**
 * Validate a Fireflies API key by attempting to fetch the user profile
 */
export async function validateApiKey(apiKey: string): Promise<{ valid: boolean; user?: FirefliesUser; error?: string }> {
  try {
    const user = await getFirefliesUser(apiKey);
    return { valid: true, user };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}
