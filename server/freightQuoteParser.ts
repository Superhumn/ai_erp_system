/**
 * Freight Quote Parser
 *
 * Extracts a carrier's reply — email body, attached rate sheet, or both — into
 * the structured fields `freightQuotes` stores. The freight counterpart to
 * `server/vendorQuoteParser.ts`.
 *
 * Attachments matter more here than on the vendor side: carriers quote lanes on
 * PDF or spreadsheet rate sheets far more often than in the body of a mail, so a
 * parser that only reads the body misses most of what arrives. The attachment
 * path reuses `buildDocumentMessageContent`, giving a scanned rate sheet the same
 * pdfjs → OCR fallback as every other document in the system.
 *
 * Extraction is the one part of this pipeline that is inherently a language task,
 * so it uses the model. Everything downstream of it — conversion, scope gaps,
 * chargeable weight, ranking — stays deterministic in
 * `server/freightQuoteNormalization.ts`.
 */

import { invokeLLM } from "./_core/llm";
import { buildDocumentMessageContent } from "./documentImportService";
import { normalizeCurrencyCode } from "./currencyService";
import { parseServiceScope, type ServiceScope } from "./freightQuoteNormalization";
import { parseLlmJson } from "./llmJson";

// ─── Extraction shape ──────────────────────────────────────────────────

export interface FreightQuoteExtraction {
  isQuote: boolean;
  confidence: number;
  responseType: "quote" | "decline" | "clarification" | "other";
  rfqNumber: string | null;
  quoteNumber: string | null;
  carrierName: string | null;
  freightCost: number | null;
  fuelSurcharge: number | null;
  originCharges: number | null;
  destinationCharges: number | null;
  customsFees: number | null;
  insuranceCost: number | null;
  otherCharges: number | null;
  totalCost: number | null;
  currency: string | null;
  serviceScope: ServiceScope | null;
  rateBasis: string | null;
  chargeableWeightKg: number | null;
  transitDays: number | null;
  shippingMode: string | null;
  routeDescription: string | null;
  validUntilDate: string | null;
  notes: string | null;
}

const EMPTY_EXTRACTION: FreightQuoteExtraction = {
  isQuote: false,
  confidence: 0,
  responseType: "other",
  rfqNumber: null,
  quoteNumber: null,
  carrierName: null,
  freightCost: null,
  fuelSurcharge: null,
  originCharges: null,
  destinationCharges: null,
  customsFees: null,
  insuranceCost: null,
  otherCharges: null,
  totalCost: null,
  currency: null,
  serviceScope: null,
  rateBasis: null,
  chargeableWeightKg: null,
  transitDays: null,
  shippingMode: null,
  routeDescription: null,
  validUntilDate: null,
  notes: null,
};

const RATE_BASES = ["per_kg", "per_cbm", "per_revenue_ton", "per_container", "flat"];

const EXTRACTION_INSTRUCTIONS = `You are a logistics analyst extracting a carrier's freight quotation into structured data.

Rules:
- Report only what the document states. Never estimate, average, or fill a gap with a typical value. Use null.
- Amounts must be plain numbers with no currency symbols or thousands separators.
- "currency" is the 3-letter ISO code the rates are quoted in.
- Split charges into their named buckets. Put anything you cannot place — THC, documentation,
  BAF/CAF, security, chassis, demurrage allowances — into otherCharges, and name each of them in notes.
- "totalCost" is the carrier's own all-in figure. If the document gives no total, leave it null
  rather than adding the components up yourself.
- "serviceScope" is one of port_to_port, door_to_port, port_to_door, door_to_door. Map the carrier's
  wording (P2P, CY/CY, DTD, "door to door", "ex-works pickup included") onto one of these. Use null
  if the document does not make the scope clear.
- "rateBasis" is one of per_kg, per_cbm, per_revenue_ton, per_container, flat — how the rate is struck.
- "chargeableWeightKg" is the chargeable/billable weight the carrier states, in kilograms. Convert
  from pounds if needed (1 lb = 0.45359237 kg). Null if not stated — do not compute it yourself.
- "transitDays" is port-to-port or door-to-door transit in days, whichever the document states.
- "responseType" is "quote" when rates are given, "decline" when the carrier is declining to quote,
  "clarification" when they are asking a question, "other" otherwise.
- "confidence" is 0-100 for how completely you could read the document.

Respond with JSON only.`;

const EXTRACTION_SCHEMA = {
  isQuote: "boolean",
  confidence: "number 0-100",
  responseType: "quote | decline | clarification | other",
  rfqNumber: "string or null",
  quoteNumber: "string or null",
  carrierName: "string or null",
  freightCost: "number or null",
  fuelSurcharge: "number or null",
  originCharges: "number or null",
  destinationCharges: "number or null",
  customsFees: "number or null",
  insuranceCost: "number or null",
  otherCharges: "number or null",
  totalCost: "number or null",
  currency: "3-letter ISO code or null",
  serviceScope: "port_to_port | door_to_port | port_to_door | door_to_door | null",
  rateBasis: "per_kg | per_cbm | per_revenue_ton | per_container | flat | null",
  chargeableWeightKg: "number or null",
  transitDays: "number or null",
  shippingMode: "string or null",
  routeDescription: "string or null",
  validUntilDate: "ISO date string or null",
  notes: "string or null",
};

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  // Strip currency symbols/separators a model may have left in despite the prompt.
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s && s.toLowerCase() !== "null" ? s : null;
}

export function coerceFreightExtraction(parsed: any): FreightQuoteExtraction {
  const responseType = ["quote", "decline", "clarification", "other"].includes(parsed?.responseType)
    ? parsed.responseType
    : "other";
  const rawRateBasis = toStr(parsed?.rateBasis)?.toLowerCase().replace(/[\s-]+/g, "_") ?? null;
  return {
    isQuote: !!parsed?.isQuote,
    confidence: toNum(parsed?.confidence) ?? 0,
    responseType,
    rfqNumber: toStr(parsed?.rfqNumber),
    quoteNumber: toStr(parsed?.quoteNumber),
    carrierName: toStr(parsed?.carrierName),
    freightCost: toNum(parsed?.freightCost),
    fuelSurcharge: toNum(parsed?.fuelSurcharge),
    originCharges: toNum(parsed?.originCharges),
    destinationCharges: toNum(parsed?.destinationCharges),
    customsFees: toNum(parsed?.customsFees),
    insuranceCost: toNum(parsed?.insuranceCost),
    otherCharges: toNum(parsed?.otherCharges),
    totalCost: toNum(parsed?.totalCost),
    currency: normalizeCurrencyCode(toStr(parsed?.currency)),
    // Route through the same parser the normalizer uses, so a free-text scope
    // ("CY/CY") lands on the same value however it arrived.
    serviceScope: parseServiceScope(toStr(parsed?.serviceScope)),
    rateBasis: rawRateBasis && RATE_BASES.includes(rawRateBasis) ? rawRateBasis : null,
    chargeableWeightKg: toNum(parsed?.chargeableWeightKg),
    transitDays: toNum(parsed?.transitDays),
    shippingMode: toStr(parsed?.shippingMode),
    routeDescription: toStr(parsed?.routeDescription),
    validUntilDate: toStr(parsed?.validUntilDate),
    notes: toStr(parsed?.notes),
  };
}

export function parseFreightExtractionJson(raw: unknown): FreightQuoteExtraction {
  // Shared tolerant recovery, so a fenced block behind a sentence still parses.
  const parsed = parseLlmJson(raw);
  if (parsed === null || typeof parsed !== "object") return { ...EMPTY_EXTRACTION };
  return coerceFreightExtraction(parsed);
}

// ─── Extraction entry points ───────────────────────────────────────────

export async function parseFreightQuoteEmail(input: {
  subject: string;
  body: string;
  fromEmail: string;
  fromName?: string | null;
}): Promise<FreightQuoteExtraction> {
  const prompt = `${EXTRACTION_INSTRUCTIONS}

EMAIL
From: ${input.fromName ? `${input.fromName} <${input.fromEmail}>` : input.fromEmail}
Subject: ${input.subject}

Body:
${(input.body || "").slice(0, 12000)}

Return JSON with exactly these keys:
${JSON.stringify(EXTRACTION_SCHEMA, null, 2)}`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You extract structured freight quotations from carrier emails. Always respond with valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
  });

  return parseFreightExtractionJson(response.choices[0]?.message?.content);
}

export async function parseFreightQuoteAttachment(input: {
  fileUrl: string;
  fileName: string;
}): Promise<FreightQuoteExtraction> {
  const prompt = `${EXTRACTION_INSTRUCTIONS}

The attached document is a carrier rate sheet or quotation (filename: ${input.fileName}).
Rate sheets often tabulate several lanes or service levels. Extract the one matching the
requested lane; if you cannot tell which applies, extract the cheapest complete row and
say in notes which lane you read and what the alternatives were.

Return JSON with exactly these keys:
${JSON.stringify(EXTRACTION_SCHEMA, null, 2)}`;

  const built = await buildDocumentMessageContent(input.fileUrl, input.fileName, prompt);
  if (built.error || built.content.length === 0) {
    return { ...EMPTY_EXTRACTION, notes: built.error ?? "Attachment could not be read." };
  }

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You extract structured freight quotations from carrier rate sheets. Always respond with valid JSON only.",
      },
      { role: "user", content: built.content as any },
    ],
  });

  return parseFreightExtractionJson(response.choices[0]?.message?.content);
}

/**
 * Combine a body extraction with attachment extractions.
 *
 * The attachment wins field-by-field where it has a value: when a carrier sends
 * both, the rate sheet is the binding document and the body is a summary of it.
 * Confidence is the best of the inputs; notes are concatenated so nothing a
 * parser flagged is dropped.
 */
export function mergeFreightExtractions(
  ...extractions: FreightQuoteExtraction[]
): FreightQuoteExtraction {
  const present = extractions.filter(Boolean);
  if (present.length === 0) return { ...EMPTY_EXTRACTION };
  if (present.length === 1) return present[0];

  const merged: FreightQuoteExtraction = { ...present[0] };
  for (const next of present.slice(1)) {
    for (const key of Object.keys(EMPTY_EXTRACTION) as (keyof FreightQuoteExtraction)[]) {
      if (key === "confidence" || key === "notes" || key === "isQuote" || key === "responseType") {
        continue;
      }
      const value = next[key];
      if (value !== null && value !== undefined) {
        (merged as any)[key] = value;
      }
    }
    merged.isQuote = merged.isQuote || next.isQuote;
    if (next.responseType === "quote") merged.responseType = "quote";
    merged.confidence = Math.max(merged.confidence, next.confidence);
    const notes = [merged.notes, next.notes].filter(Boolean);
    merged.notes = notes.length ? notes.join(" | ") : null;
  }
  return merged;
}

/** Find an RFQ reference in free text, e.g. "FRFQ-20260112-AB12". */
export function findFreightRfqNumber(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    // Segments after the first must be hyphen-joined: allowing whitespace here
    // lets the match run on into the next word ("FRFQ-1-AB rates" -> "...-RATES").
    const match = text.match(/\b(?:FRFQ|RFQ)[-\s]?[A-Z0-9]{2,}(?:-[A-Z0-9]{2,})*/i);
    if (match) return match[0].replace(/\s+/g, "-").toUpperCase();
  }
  return null;
}

/** Map an extraction onto the `freightQuotes` insert shape. */
export function quoteValuesFromExtraction(
  extraction: FreightQuoteExtraction,
  context: { rfqId: number; carrierId: number; rawEmailContent?: string | null },
) {
  const validUntil = extraction.validUntilDate ? new Date(extraction.validUntilDate) : null;
  return {
    rfqId: context.rfqId,
    carrierId: context.carrierId,
    quoteNumber: extraction.quoteNumber ?? undefined,
    freightCost: extraction.freightCost?.toString(),
    fuelSurcharge: extraction.fuelSurcharge?.toString(),
    originCharges: extraction.originCharges?.toString(),
    destinationCharges: extraction.destinationCharges?.toString(),
    customsFees: extraction.customsFees?.toString(),
    insuranceCost: extraction.insuranceCost?.toString(),
    otherCharges: extraction.otherCharges?.toString(),
    totalCost: extraction.totalCost?.toString(),
    currency: extraction.currency ?? "USD",
    serviceScope: extraction.serviceScope ?? undefined,
    rateBasis: extraction.rateBasis ?? undefined,
    chargeableWeightKg: extraction.chargeableWeightKg?.toString(),
    transitDays: extraction.transitDays ?? undefined,
    shippingMode: extraction.shippingMode ?? undefined,
    routeDescription: extraction.routeDescription ?? undefined,
    validUntil: validUntil && !isNaN(validUntil.getTime()) ? validUntil : undefined,
    notes: extraction.notes ?? undefined,
    receivedVia: "email" as const,
    rawEmailContent: context.rawEmailContent?.slice(0, 5000) ?? undefined,
    status: "received" as const,
  };
}
