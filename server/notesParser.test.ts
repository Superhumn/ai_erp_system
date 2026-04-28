import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";
import { parseNoteWithLLM } from "./notesParser";

const mockInvoke = vi.mocked(invokeLLM);

function llmReply(content: string): any {
  return { choices: [{ message: { content } }] };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("parseNoteWithLLM", () => {
  it("parses a clean JSON response", async () => {
    mockInvoke.mockResolvedValueOnce(
      llmReply(
        JSON.stringify({
          title: "Sales call",
          items: [
            { kind: "task", id: "i1", confidence: 0.9, summary: "Follow up", title: "Follow up with Sarah" },
          ],
        }),
      ),
    );

    const res = await parseNoteWithLLM("Met Sarah, follow up", "2026-04-26");
    expect(res.title).toBe("Sales call");
    expect(res.items).toHaveLength(1);
    expect(res.items[0].kind).toBe("task");
  });

  it("strips ```json fenced output", async () => {
    mockInvoke.mockResolvedValueOnce(
      llmReply(
        '```json\n{"title": null, "items": [{"kind":"idea","id":"i1","confidence":0.5,"summary":"thought"}]}\n```',
      ),
    );

    const res = await parseNoteWithLLM("random thought", "2026-04-26");
    expect(res.items).toHaveLength(1);
    expect(res.items[0].kind).toBe("idea");
  });

  it("recovers from leading/trailing prose around JSON", async () => {
    mockInvoke.mockResolvedValueOnce(
      llmReply(
        'Here is the parse:\n{"title": "x", "items": [{"kind":"task","id":"i1","confidence":0.7,"summary":"do it","title":"Do it"}]}\nLet me know if you need more.',
      ),
    );

    const res = await parseNoteWithLLM("note", "2026-04-26");
    expect(res.title).toBe("x");
    expect(res.items[0].kind).toBe("task");
  });

  it("filters out items with unknown kinds", async () => {
    mockInvoke.mockResolvedValueOnce(
      llmReply(
        JSON.stringify({
          title: null,
          items: [
            { kind: "task", id: "i1", confidence: 0.8, summary: "ok", title: "Real task" },
            { kind: "spell", id: "i2", confidence: 0.9, summary: "fireball" },
            { kind: null, id: "i3", confidence: 0.5, summary: "broken" },
            { kind: "idea", id: "i4", confidence: 0.3, summary: "thought" },
          ],
        }),
      ),
    );

    const res = await parseNoteWithLLM("note", "2026-04-26");
    const kinds = res.items.map((i) => i.kind);
    expect(kinds).toEqual(["task", "idea"]);
  });

  it("returns empty result when LLM produces no JSON-ish text", async () => {
    mockInvoke.mockResolvedValueOnce(llmReply(""));
    const res = await parseNoteWithLLM("note", "2026-04-26");
    expect(res).toEqual({ title: null, items: [] });
  });

  it("throws when content is not parseable JSON at all", async () => {
    mockInvoke.mockResolvedValueOnce(llmReply("definitely not json"));
    await expect(parseNoteWithLLM("note", "2026-04-26")).rejects.toThrow(/JSON/);
  });

  it("backfills missing ids and confidences", async () => {
    mockInvoke.mockResolvedValueOnce(
      llmReply(
        JSON.stringify({
          title: null,
          items: [
            { kind: "idea", summary: "no id, no confidence" },
            { kind: "task", id: "", summary: "blank id", title: "T" },
          ],
        }),
      ),
    );

    const res = await parseNoteWithLLM("note", "2026-04-26");
    expect(res.items).toHaveLength(2);
    expect(res.items[0].id).toBe("i1");
    expect(res.items[0].confidence).toBe(0.5);
    expect(res.items[1].id).toBe("i2");
  });

  it("handles malformed items array gracefully", async () => {
    mockInvoke.mockResolvedValueOnce(
      llmReply(JSON.stringify({ title: null, items: "not an array" })),
    );
    const res = await parseNoteWithLLM("note", "2026-04-26");
    expect(res.items).toEqual([]);
  });
});
