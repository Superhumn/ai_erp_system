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
  participant_emails: string[];
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
 * List recent transcripts from Fireflies
 */
export async function listTranscripts(apiKey: string, limit: number = 50): Promise<FirefliesTranscript[]> {
  const query = `
    query ListTranscripts($limit: Int) {
      transcripts(limit: $limit) {
        id
        title
        date
        duration
        organizer_email
        participants
        participant_emails
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

  const data = await firefliesQuery<{ transcripts: FirefliesTranscript[] }>(apiKey, query, { limit });
  return data.transcripts || [];
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
        participant_emails
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
export function parseActionItems(rawItems: string[]): FirefliesActionItem[] {
  return rawItems.map((text) => {
    const item: FirefliesActionItem = { text: text.trim() };

    // Try to extract assignee patterns like "John:" or "@John" or "assigned to John"
    const assigneePatterns = [
      /^([A-Z][a-z]+ ?[A-Z]?[a-z]*):\s*/,           // "John Smith: do something"
      /@(\w+ ?\w*)/,                                    // "@John do something"
      /assigned to ([A-Z][a-z]+ ?[A-Z]?[a-z]*)/i,     // "assigned to John"
      /\(([A-Z][a-z]+ ?[A-Z]?[a-z]*)\)\s*$/,          // "do something (John)"
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

  // From participant_emails + participants arrays (fallback)
  if (transcript.participant_emails && transcript.participants) {
    for (let i = 0; i < transcript.participant_emails.length; i++) {
      const email = transcript.participant_emails[i]?.toLowerCase();
      if (email && !participantMap.has(email)) {
        participantMap.set(email, {
          name: transcript.participants[i] || email.split("@")[0],
          email,
        });
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
