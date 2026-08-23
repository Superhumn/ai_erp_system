/**
 * Tolerant JSON recovery for model output.
 *
 * `response_format: json_schema` is only a prompt hint in this codebase (see
 * server/_core/llm.ts) — nothing enforces the shape — so callers get whatever
 * the model emitted. In practice that is usually clean JSON, sometimes a fenced
 * block, and occasionally a fenced block with a sentence in front of it.
 *
 * Stripping only a leading fence and calling JSON.parse fails on that last case
 * and takes the whole mutation with it. Recovery order here:
 *
 *   1. parse as-is
 *   2. strip surrounding code fences, parse again
 *   3. take the outermost {...} or [...] span and parse that
 *
 * Returns null rather than throwing, so callers decide whether a miss is fatal.
 */

/** Strip a Markdown code fence from around a payload, wherever it sits. */
function stripFences(text: string): string {
  const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1].trim()) return fenced[1].trim();
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/** Outermost balanced-looking JSON span, preferring an object over an array. */
function firstJsonSpan(text: string): string | null {
  const object = text.match(/\{[\s\S]*\}/);
  if (object) return object[0];
  const array = text.match(/\[[\s\S]*\]/);
  if (array) return array[0];
  return null;
}

/**
 * Best-effort parse of a model response into JSON. `raw` may be the string the
 * model returned or an already-structured value.
 */
export function parseLlmJson(raw: unknown): unknown | null {
  if (raw === null || raw === undefined) return null;
  // Some providers hand back structured content directly.
  if (typeof raw === "object") return raw;

  const text = String(raw).trim();
  if (!text) return null;

  const candidates = [text, stripFences(text)];
  const span = firstJsonSpan(stripFences(text)) ?? firstJsonSpan(text);
  if (span) candidates.push(span);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next, more aggressive, candidate.
    }
  }
  return null;
}
