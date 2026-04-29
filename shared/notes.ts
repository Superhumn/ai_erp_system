// Shared types for the quick-note parser.
// The LLM is asked to return JSON matching `NoteParseResult`.
// `NoteAppliedItem` is what the apply step records back on the note.

export type NoteItemKind = "task" | "crm_contact" | "reminder" | "idea";

export const NOTE_ITEM_KINDS: readonly NoteItemKind[] = ["task", "crm_contact", "reminder", "idea"];

// Destinations a parsed item can land in once applied. Aligned with what
// `notes.applyItems` actually writes to.
export type NoteAppliedEntityType =
  | "project_task"
  | "crm_contact"
  | "notification"
  | "idea";

export interface NoteParsedTask {
  kind: "task";
  id: string; // stable client id for selection (e.g. "t1")
  confidence: number;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "critical";
  dueDate?: string; // ISO date
  summary: string;
  sourceQuote?: string;
}

export interface NoteParsedContact {
  kind: "crm_contact";
  id: string;
  confidence: number;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  organization?: string;
  jobTitle?: string;
  contactType?: "lead" | "prospect" | "customer" | "partner" | "investor" | "donor" | "vendor" | "other";
  notes?: string;
  summary: string;
  sourceQuote?: string;
}

export interface NoteParsedReminder {
  kind: "reminder";
  id: string;
  confidence: number;
  title: string;
  remindAt?: string; // ISO date
  summary: string;
  sourceQuote?: string;
}

export interface NoteParsedIdea {
  kind: "idea";
  id: string;
  confidence: number;
  title: string;
  summary: string;
  sourceQuote?: string;
}

export type NoteParsedItem =
  | NoteParsedTask
  | NoteParsedContact
  | NoteParsedReminder
  | NoteParsedIdea;

export interface NoteParseResult {
  title: string | null;
  items: NoteParsedItem[];
}

export interface NoteAppliedItem {
  kind: NoteItemKind;
  itemId: string;        // matches NoteParsedItem.id
  entityType: NoteAppliedEntityType;
  entityId: number | null;
  label: string;
}

// JSON schema delivered to the LLM via invokeLLM(outputSchema). Kept as a
// const so client and server agree on exactly what the model is asked for.
export const NOTE_PARSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: ["string", "null"],
      description: "Short title summarizing the note (<= 80 chars). Null if note is too short to summarize.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["task", "crm_contact", "reminder", "idea"] },
          id: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          summary: { type: "string" },
          sourceQuote: { type: "string" },
          // task
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          dueDate: { type: "string" },
          // contact
          firstName: { type: "string" },
          lastName: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          organization: { type: "string" },
          jobTitle: { type: "string" },
          contactType: {
            type: "string",
            enum: ["lead", "prospect", "customer", "partner", "investor", "donor", "vendor", "other"],
          },
          notes: { type: "string" },
          // reminder
          remindAt: { type: "string" },
        },
        required: ["kind", "id", "confidence", "summary"],
      },
    },
  },
  required: ["title", "items"],
} as const;
