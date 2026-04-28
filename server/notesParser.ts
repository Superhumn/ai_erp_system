import { invokeLLM } from "./_core/llm";
import {
  NOTE_ITEM_KINDS,
  NOTE_PARSE_JSON_SCHEMA,
  type NoteItemKind,
  type NoteParseResult,
  type NoteParsedItem,
} from "@shared/notes";

const KIND_SET: ReadonlySet<NoteItemKind> = new Set(NOTE_ITEM_KINDS);

const SYSTEM_PROMPT = `You are an assistant inside an ERP. The user jots quick notes (think Apple Notes) and you split each note into structured items that can be routed into the right system.

Detect items of these kinds:
- "task": a thing to do. Pull out a short imperative title, optional priority and due date if mentioned.
- "crm_contact": a person/company referenced as a lead/prospect/customer/investor/partner/vendor. Extract name, email, phone, organization when present.
- "reminder": a time-based ping that doesn't really belong in a project task list (e.g. "remind me to call mom Friday").
- "idea": a thought, observation, or note-to-self that has no action attached.

Rules:
- One note can produce zero, one, or many items. A pure brain-dump is fine — emit "idea" entries.
- Set "confidence" 0–1 based on how cleanly the item is stated. Low confidence is ok; the user reviews before applying.
- "summary" is one short human sentence ("Create task: …", "Add contact …").
- "sourceQuote" is the exact substring from the note that triggered the item. Keep it short.
- Give every item a stable "id" like "i1", "i2", "i3" in order of appearance.
- For dueDate / remindAt, return ISO 8601 (YYYY-MM-DD or full datetime). Resolve relative phrases ("Friday", "next week") against {today}.
- Never invent data. If a field isn't in the note, omit it.
- Output JSON ONLY matching the provided schema. No prose.`;

export async function parseNoteWithLLM(content: string, todayIso: string): Promise<NoteParseResult> {
  const system = SYSTEM_PROMPT.replace("{today}", todayIso);

  const response = await invokeLLM({
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    maxTokens: 2048,
    outputSchema: {
      name: "note_parse_result",
      schema: NOTE_PARSE_JSON_SCHEMA as unknown as Record<string, unknown>,
      strict: true,
    },
  });

  const raw = response.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw : "";
  if (!text.trim()) {
    return { title: null, items: [] };
  }

  // The LLM is told to return JSON only; tolerate ```json fences just in case.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to find the first {...} block in case the model added stray text.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM did not return JSON for note parse");
    parsed = JSON.parse(match[0]);
  }

  const result = parsed as NoteParseResult;
  if (!result || !Array.isArray(result.items)) {
    return { title: null, items: [] };
  }

  // Defensive normalization: drop items with unknown/missing kind, ensure ids.
  const items: NoteParsedItem[] = [];
  result.items.forEach((it, idx) => {
    if (!it || typeof it.kind !== "string" || !KIND_SET.has(it.kind as NoteItemKind)) return;
    const id = typeof it.id === "string" && it.id.length > 0 ? it.id : `i${idx + 1}`;
    const confidence = typeof it.confidence === "number" ? it.confidence : 0.5;
    const summary = typeof it.summary === "string" ? it.summary : "";
    items.push({ ...it, id, confidence, summary } as NoteParsedItem);
  });

  return { title: result.title ?? null, items };
}
