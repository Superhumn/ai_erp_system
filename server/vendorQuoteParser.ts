/**
 * Vendor Quote Parser
 *
 * Turns an inbound vendor reply — the email body, an attached quote sheet, or
 * both — into a structured `vendorQuotes` row, then normalizes it against the
 * RFQ's comparison basis so it is immediately comparable to the other bids.
 *
 * Extraction is LLM-based (quotes arrive as prose, PDFs and spreadsheets, in no
 * fixed layout). Everything downstream of extraction — matching the vendor,
 * matching the RFQ, landed-cost maths — is deterministic.
 *
 * Attachments reuse `buildDocumentMessageContent`, so a scanned PDF quote goes
 * through the same OCR path as every other document in the system.
 */

import { and, desc, eq, inArray, like } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db/connection";
import {
  vendorQuotes,
  vendorRfqEmails,
  vendorRfqInvitations,
  vendorRfqs,
  vendors,
} from "../drizzle/schema";
import { buildDocumentMessageContent } from "./documentImportService";
import { normalizeQuotesForRfq } from "./quoteNormalization";
import { currencyOr, normalizeCurrencyCode } from "./currencyService";
import { recordInvitationResponse } from "./vendorResponsiveness";
import { parseLlmJson } from "./llmJson";

// ─── Extraction shape ──────────────────────────────────────────────────

export interface VendorQuoteExtraction {
  /** false when the document is not a quote at all (an OOO reply, a decline, an invoice). */
  isQuote: boolean;
  /** 0-100. */
  confidence: number;
  /** "quote" | "decline" | "clarification" | "other" — drives what we do with it. */
  responseType: "quote" | "decline" | "clarification" | "other";
  rfqNumber: string | null;
  quoteNumber: string | null;
  vendorName: string | null;
  materialName: string | null;

  unitPrice: number | null;
  quantity: number | null;
  totalPrice: number | null;
  currency: string | null;

  shippingCost: number | null;
  handlingFee: number | null;
  taxAmount: number | null;
  otherCharges: number | null;
  insuranceCost: number | null;
  customsDutyAmount: number | null;

  incoterms: string | null;
  namedPlace: string | null;

  minimumOrderQty: number | null;
  leadTimeDays: number | null;
  validUntilDate: string | null;
  paymentTerms: string | null;

  toolingCost: number | null;
  toolingAmortizationUnits: number | null;
  toolingIsRefundable: boolean | null;

  notes: string | null;
}

const EMPTY_EXTRACTION: VendorQuoteExtraction = {
  isQuote: false,
  confidence: 0,
  responseType: "other",
  rfqNumber: null,
  quoteNumber: null,
  vendorName: null,
  materialName: null,
  unitPrice: null,
  quantity: null,
  totalPrice: null,
  currency: null,
  shippingCost: null,
  handlingFee: null,
  taxAmount: null,
  otherCharges: null,
  insuranceCost: null,
  customsDutyAmount: null,
  incoterms: null,
  namedPlace: null,
  minimumOrderQty: null,
  leadTimeDays: null,
  validUntilDate: null,
  paymentTerms: null,
  toolingCost: null,
  toolingAmortizationUnits: null,
  toolingIsRefundable: null,
  notes: null,
};

const EXTRACTION_INSTRUCTIONS = `You are a procurement analyst extracting a supplier quotation into structured data.

Rules:
- Report every money amount as a plain number, with no currency symbol, thousands separator or unit suffix.
- "currency" is the ISO-4217 code of the amounts you extracted (USD, EUR, CNY, GBP, JPY, INR, ...). Infer it from symbols (€ -> EUR, £ -> GBP, ¥ -> JPY or CNY based on context, $ -> USD unless the document says otherwise).
- "incoterms" is the trade term code exactly as stated (EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP). "namedPlace" is the port/place that follows it, e.g. "FOB Ningbo" -> incoterms "FOB", namedPlace "Ningbo".
- "minimumOrderQty" is the supplier's MOQ in the same unit as the quoted quantity.
- Tooling / NRE / mould / setup / die / plate / one-time engineering charges go in "toolingCost", NOT in otherCharges. If the supplier says the tooling is amortized over a volume, put that volume in "toolingAmortizationUnits". Set "toolingIsRefundable" true only if the supplier states the tooling charge is refundable or creditable against future orders.
- Freight/shipping goes in shippingCost, duties in customsDutyAmount, cargo insurance in insuranceCost. Do not double-count a charge in more than one field.
- "leadTimeDays" is production + shipping lead time in days. Convert weeks to days.
- "validUntilDate" is ISO YYYY-MM-DD. If the supplier gives a validity window ("valid 30 days"), compute the date from the document/email date.
- "rfqNumber" is our RFQ reference if the supplier quoted one back.
- Set "isQuote" false and pick the matching "responseType" when the message declines to bid, asks a clarifying question, or is not a quotation at all.
- Use null for anything not stated. Never invent a number.`;

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    isQuote: { type: "boolean" },
    confidence: { type: "number" },
    responseType: { type: "string", enum: ["quote", "decline", "clarification", "other"] },
    rfqNumber: { type: ["string", "null"] },
    quoteNumber: { type: ["string", "null"] },
    vendorName: { type: ["string", "null"] },
    materialName: { type: ["string", "null"] },
    unitPrice: { type: ["number", "null"] },
    quantity: { type: ["number", "null"] },
    totalPrice: { type: ["number", "null"] },
    currency: { type: ["string", "null"] },
    shippingCost: { type: ["number", "null"] },
    handlingFee: { type: ["number", "null"] },
    taxAmount: { type: ["number", "null"] },
    otherCharges: { type: ["number", "null"] },
    insuranceCost: { type: ["number", "null"] },
    customsDutyAmount: { type: ["number", "null"] },
    incoterms: { type: ["string", "null"] },
    namedPlace: { type: ["string", "null"] },
    minimumOrderQty: { type: ["number", "null"] },
    leadTimeDays: { type: ["number", "null"] },
    validUntilDate: { type: ["string", "null"] },
    paymentTerms: { type: ["string", "null"] },
    toolingCost: { type: ["number", "null"] },
    toolingAmortizationUnits: { type: ["number", "null"] },
    toolingIsRefundable: { type: ["boolean", "null"] },
    notes: { type: ["string", "null"] },
  },
  required: ["isQuote", "confidence", "responseType"],
  additionalProperties: false,
} as const;

/** Tolerant JSON extraction — `response_format` is a prompt hint here, not a guarantee. */
export function parseExtractionJson(raw: unknown): VendorQuoteExtraction {
  // Shared tolerant recovery, so a fenced block behind a sentence still parses.
  const parsed = parseLlmJson(raw);
  if (parsed === null || typeof parsed !== "object") return { ...EMPTY_EXTRACTION };
  return coerceExtraction(parsed);
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  // Strip currency symbols/separators an LLM may have left in despite the prompt.
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s && s.toLowerCase() !== "null" ? s : null;
}

export function coerceExtraction(parsed: any): VendorQuoteExtraction {
  const responseType = ["quote", "decline", "clarification", "other"].includes(parsed?.responseType)
    ? parsed.responseType
    : "other";
  return {
    isQuote: !!parsed?.isQuote,
    confidence: toNum(parsed?.confidence) ?? 0,
    responseType,
    rfqNumber: toStr(parsed?.rfqNumber),
    quoteNumber: toStr(parsed?.quoteNumber),
    vendorName: toStr(parsed?.vendorName),
    materialName: toStr(parsed?.materialName),
    unitPrice: toNum(parsed?.unitPrice),
    quantity: toNum(parsed?.quantity),
    totalPrice: toNum(parsed?.totalPrice),
    currency: normalizeCurrencyCode(toStr(parsed?.currency)),
    shippingCost: toNum(parsed?.shippingCost),
    handlingFee: toNum(parsed?.handlingFee),
    taxAmount: toNum(parsed?.taxAmount),
    otherCharges: toNum(parsed?.otherCharges),
    insuranceCost: toNum(parsed?.insuranceCost),
    customsDutyAmount: toNum(parsed?.customsDutyAmount),
    incoterms: toStr(parsed?.incoterms)?.toUpperCase() ?? null,
    namedPlace: toStr(parsed?.namedPlace),
    minimumOrderQty: toNum(parsed?.minimumOrderQty),
    leadTimeDays: toNum(parsed?.leadTimeDays),
    validUntilDate: toStr(parsed?.validUntilDate),
    paymentTerms: toStr(parsed?.paymentTerms),
    toolingCost: toNum(parsed?.toolingCost),
    toolingAmortizationUnits: toNum(parsed?.toolingAmortizationUnits),
    toolingIsRefundable:
      parsed?.toolingIsRefundable === true ? true : parsed?.toolingIsRefundable === false ? false : null,
    notes: toStr(parsed?.notes),
  };
}

/** Find an RFQ reference in free text, e.g. "RFQ-20260112-AB12" or "RFQ-ING-XYZ". */
export function findRfqNumber(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    // Segments after the first must be hyphen-joined: allowing whitespace here
    // lets the match run on into the next word ("RFQ-1-AB rates" -> "...-RATES").
    const match = text.match(/\bRFQ[-\s]?(?:ING[-\s]?)?[A-Z0-9]{2,}(?:-[A-Z0-9]{2,})*/i);
    if (match) return match[0].replace(/\s+/g, "-").toUpperCase();
  }
  return null;
}

// ─── Extraction entry points ───────────────────────────────────────────

export async function parseVendorQuoteEmail(input: {
  subject: string;
  body: string;
  fromEmail?: string;
  fromName?: string;
  receivedAt?: Date;
}): Promise<VendorQuoteExtraction> {
  const prompt = `${EXTRACTION_INSTRUCTIONS}

EMAIL
From: ${input.fromName ? `${input.fromName} <${input.fromEmail ?? ""}>` : input.fromEmail ?? "unknown"}
Date: ${(input.receivedAt ?? new Date()).toISOString().slice(0, 10)}
Subject: ${input.subject}

BODY:
${(input.body || "").substring(0, 12000)}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You extract supplier quotations into structured JSON. Respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "vendor_quote_extraction", strict: true, schema: EXTRACTION_SCHEMA as any },
      },
    });
    return parseExtractionJson(response.choices[0]?.message?.content);
  } catch (error) {
    console.error("[VendorQuoteParser] Email extraction failed:", error);
    return { ...EMPTY_EXTRACTION };
  }
}

export async function parseVendorQuoteAttachment(input: {
  fileUrl: string;
  fileName: string;
  context?: string;
}): Promise<VendorQuoteExtraction> {
  const prompt = `${EXTRACTION_INSTRUCTIONS}

DOCUMENT: ${input.fileName}
${input.context ? `\nCONTEXT FROM THE COVERING EMAIL:\n${input.context.substring(0, 2000)}\n` : ""}
Extract the quotation from the attached document.`;

  const built = await buildDocumentMessageContent(input.fileUrl, input.fileName, prompt);
  if (!built.ok) {
    console.error("[VendorQuoteParser] Could not read attachment:", built.error);
    return { ...EMPTY_EXTRACTION };
  }

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: built.hasImageContent
            ? "You extract supplier quotations from document images. Respond with ONLY valid JSON, no other text."
            : "You extract supplier quotations into structured JSON. Respond with valid JSON only.",
        },
        { role: "user", content: built.content },
      ],
      // Vision content and strict schemas do not mix on every model, same
      // caveat as parseUploadedDocument.
      ...(built.hasImageContent
        ? {}
        : {
            response_format: {
              type: "json_schema",
              json_schema: { name: "vendor_quote_extraction", strict: true, schema: EXTRACTION_SCHEMA as any },
            },
          }),
    });
    return parseExtractionJson(response.choices[0]?.message?.content);
  } catch (error) {
    console.error("[VendorQuoteParser] Attachment extraction failed:", error);
    return { ...EMPTY_EXTRACTION };
  }
}

/**
 * Merge an attachment extraction over an email-body extraction. The attachment
 * is the authoritative quote document, so its values win; the body fills gaps
 * (suppliers often state the MOQ or lead time only in the covering note).
 */
export function mergeExtractions(
  body: VendorQuoteExtraction,
  attachment: VendorQuoteExtraction,
): VendorQuoteExtraction {
  const merged: any = { ...body };
  for (const [key, value] of Object.entries(attachment)) {
    if (value !== null && value !== undefined && value !== "") merged[key] = value;
  }
  merged.isQuote = body.isQuote || attachment.isQuote;
  merged.confidence = Math.max(body.confidence, attachment.confidence);
  if (attachment.isQuote) merged.responseType = attachment.responseType;
  return merged as VendorQuoteExtraction;
}

// ─── Ingestion ─────────────────────────────────────────────────────────

export interface IngestVendorQuoteInput {
  subject: string;
  body: string;
  htmlBody?: string;
  fromEmail: string;
  fromName?: string;
  receivedAt?: Date;
  /** Optional attachment to parse alongside (or instead of) the body. */
  attachment?: { fileUrl: string; fileName: string };
  /** Skip matching and use these when the caller already knows them. */
  vendorId?: number;
  rfqId?: number;
  externalMessageId?: string;
  threadId?: string;
}

export interface IngestVendorQuoteResult {
  success: boolean;
  reason?: string;
  emailId: number | null;
  quoteId: number | null;
  rfqId: number | null;
  vendorId: number | null;
  extraction: VendorQuoteExtraction;
  normalized?: { landedTotalCost: number | null; rank: number | null; warnings: number };
}

/**
 * Match the sender to a vendor by exact email, then by sender domain (suppliers
 * routinely reply from a different mailbox on the same domain).
 */
async function matchVendor(fromEmail: string) {
  const db = await getDb();
  if (!db) return null;
  const email = fromEmail.trim().toLowerCase();
  const exact = await db.select().from(vendors).where(eq(vendors.email, email)).limit(1);
  if (exact[0]) return exact[0];

  const domain = email.split("@")[1];
  if (!domain) return null;
  // Matched in SQL rather than by scanning the whole vendor table in memory.
  const byDomain = await db
    .select()
    .from(vendors)
    .where(like(vendors.email, `%@${domain}`))
    .limit(2);
  // An ambiguous domain match is no match: picking one of several vendors at
  // random would file the quote against the wrong supplier.
  return byDomain.length === 1 ? byDomain[0] : null;
}

/**
 * Find the RFQ this reply belongs to: an explicit RFQ number wins; otherwise
 * fall back to the vendor's most recent open invitation.
 */
async function matchRfq(vendorId: number | null, rfqNumber: string | null) {
  const db = await getDb();
  if (!db) return null;

  if (rfqNumber) {
    const byNumber = await db
      .select()
      .from(vendorRfqs)
      .where(eq(vendorRfqs.rfqNumber, rfqNumber))
      .limit(1);
    if (byNumber[0]) return byNumber[0];
  }

  if (!vendorId) return null;
  const invitations = await db
    .select()
    .from(vendorRfqInvitations)
    .where(
      and(
        eq(vendorRfqInvitations.vendorId, vendorId),
        inArray(vendorRfqInvitations.status, ["sent", "viewed", "pending"] as any),
      ),
    )
    .orderBy(desc(vendorRfqInvitations.invitedAt))
    .limit(5);
  if (invitations.length === 0) return null;

  const rfqIds = invitations.map(i => i.rfqId);
  const openRfqs = await db
    .select()
    .from(vendorRfqs)
    .where(
      and(
        inArray(vendorRfqs.id, rfqIds),
        inArray(vendorRfqs.status, ["sent", "partially_received"] as any),
      ),
    )
    .orderBy(desc(vendorRfqs.createdAt));
  return openRfqs[0] ?? null;
}

/**
 * Parse an inbound vendor reply and land it as a quote.
 *
 * Always records the inbound email against the RFQ (so the thread is auditable
 * even when nothing could be extracted), then creates or updates the vendor's
 * quote, marks the invitation responded, advances the RFQ status, and re-runs
 * normalization across the RFQ so ranks stay current.
 */
export async function ingestVendorQuoteEmail(
  input: IngestVendorQuoteInput,
): Promise<IngestVendorQuoteResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const receivedAt = input.receivedAt ?? new Date();

  // ── Extract ──
  const bodyExtraction = await parseVendorQuoteEmail({
    subject: input.subject,
    body: input.body,
    fromEmail: input.fromEmail,
    fromName: input.fromName,
    receivedAt,
  });
  const extraction = input.attachment
    ? mergeExtractions(
        bodyExtraction,
        await parseVendorQuoteAttachment({
          fileUrl: input.attachment.fileUrl,
          fileName: input.attachment.fileName,
          context: input.body,
        }),
      )
    : bodyExtraction;

  // ── Match ──
  const vendor = input.vendorId
    ? (await db.select().from(vendors).where(eq(vendors.id, input.vendorId)).limit(1))[0] ?? null
    : await matchVendor(input.fromEmail);
  const vendorId = vendor?.id ?? null;

  const rfqNumber = extraction.rfqNumber ?? findRfqNumber(input.subject, input.body);
  const rfq = input.rfqId
    ? (await db.select().from(vendorRfqs).where(eq(vendorRfqs.id, input.rfqId)).limit(1))[0] ?? null
    : await matchRfq(vendorId, rfqNumber);
  const rfqId = rfq?.id ?? null;

  const emailType =
    extraction.responseType === "decline"
      ? "rejection_notification"
      : extraction.responseType === "clarification"
        ? "clarification"
        : extraction.isQuote
          ? "quote_response"
          : "other";

  // ── Record the inbound email regardless of whether a quote came out of it ──
  const emailInsert = await db.insert(vendorRfqEmails).values({
    rfqId,
    vendorId,
    direction: "inbound",
    emailType: emailType as any,
    fromEmail: input.fromEmail,
    toEmail: process.env.SENDGRID_FROM_EMAIL || "procurement@company.com",
    subject: input.subject,
    body: input.body?.substring(0, 60000) ?? null,
    htmlBody: input.htmlBody?.substring(0, 60000) ?? null,
    aiParsed: true,
    aiExtractedData: JSON.stringify(extraction),
    sendStatus: "delivered",
    externalMessageId: input.externalMessageId ?? null,
    threadId: input.threadId ?? null,
  });
  const emailId = (emailInsert as any)[0].insertId as number;

  const base: IngestVendorQuoteResult = {
    success: false,
    emailId,
    quoteId: null,
    rfqId,
    vendorId,
    extraction,
  };

  if (!vendorId) {
    return { ...base, reason: `No vendor matches ${input.fromEmail}; email recorded for manual triage.` };
  }
  if (!rfqId) {
    return { ...base, reason: "Could not match this reply to an open RFQ; email recorded for manual triage." };
  }

  // A decline still closes the loop on the invitation — it is a response.
  if (extraction.responseType === "decline") {
    await db
      .update(vendorRfqInvitations)
      .set({ status: "declined", respondedAt: receivedAt })
      .where(and(eq(vendorRfqInvitations.rfqId, rfqId), eq(vendorRfqInvitations.vendorId, vendorId)));
    await recordInvitationResponse(rfqId, vendorId, receivedAt);
    return { ...base, success: true, reason: "Vendor declined to quote." };
  }

  if (!extraction.isQuote || (extraction.unitPrice === null && extraction.totalPrice === null)) {
    return { ...base, reason: "No priced quotation found in this message; email recorded against the RFQ." };
  }

  // ── Create or update the quote ──
  const currency = currencyOr(extraction.currency ?? vendor?.defaultCurrency, "USD");
  const incoterms = extraction.incoterms ?? vendor?.defaultIncoterms ?? null;
  const validUntil = extraction.validUntilDate ? new Date(extraction.validUntilDate) : null;

  const quoteValues = {
    rfqId,
    vendorId,
    quoteNumber: extraction.quoteNumber ?? null,
    status: "received" as const,
    unitPrice: extraction.unitPrice?.toString() ?? null,
    quantity: extraction.quantity?.toString() ?? null,
    totalPrice: extraction.totalPrice?.toString() ?? null,
    currency,
    shippingCost: extraction.shippingCost?.toString() ?? null,
    handlingFee: extraction.handlingFee?.toString() ?? null,
    taxAmount: extraction.taxAmount?.toString() ?? null,
    otherCharges: extraction.otherCharges?.toString() ?? null,
    insuranceCost: extraction.insuranceCost?.toString() ?? null,
    customsDutyAmount: extraction.customsDutyAmount?.toString() ?? null,
    incoterms,
    namedPlace: extraction.namedPlace ?? null,
    minimumOrderQty: extraction.minimumOrderQty?.toString() ?? null,
    leadTimeDays: extraction.leadTimeDays ?? null,
    validUntil: validUntil && !Number.isNaN(validUntil.getTime()) ? validUntil : null,
    paymentTerms: extraction.paymentTerms ?? null,
    toolingCost: extraction.toolingCost?.toString() ?? null,
    toolingAmortizationUnits: extraction.toolingAmortizationUnits?.toString() ?? null,
    toolingIsRefundable: extraction.toolingIsRefundable ?? false,
    receivedVia: "email" as const,
    rawEmailContent: input.body?.substring(0, 20000) ?? null,
    attachments: input.attachment ? JSON.stringify([input.attachment]) : null,
    notes: extraction.notes ?? null,
  };

  // A vendor revising its bid on the same RFQ updates the existing row rather
  // than creating a second quote that would double-count in the comparison.
  const existing = await db
    .select()
    .from(vendorQuotes)
    .where(
      and(
        eq(vendorQuotes.rfqId, rfqId),
        eq(vendorQuotes.vendorId, vendorId),
        inArray(vendorQuotes.status, ["pending", "received", "under_review"] as any),
      ),
    )
    .orderBy(desc(vendorQuotes.createdAt))
    .limit(1);

  let quoteId: number;
  if (existing[0]) {
    quoteId = existing[0].id;
    await db.update(vendorQuotes).set(quoteValues as any).where(eq(vendorQuotes.id, quoteId));
  } else {
    const inserted = await db.insert(vendorQuotes).values(quoteValues as any);
    quoteId = (inserted as any)[0].insertId as number;
  }

  await db.update(vendorRfqEmails).set({ quoteId }).where(eq(vendorRfqEmails.id, emailId));

  // ── Close the loop on the invitation and the RFQ ──
  await recordInvitationResponse(rfqId, vendorId, receivedAt);

  const invitations = await db
    .select()
    .from(vendorRfqInvitations)
    .where(eq(vendorRfqInvitations.rfqId, rfqId));
  const allResponded =
    invitations.length > 0 &&
    invitations.every(i => ["responded", "declined", "no_response"].includes(i.status));
  await db
    .update(vendorRfqs)
    .set({ status: allResponded ? "all_received" : "partially_received" })
    .where(eq(vendorRfqs.id, rfqId));

  // ── Normalize the whole RFQ so ranks reflect the new bid ──
  let normalized: IngestVendorQuoteResult["normalized"];
  try {
    const result = await normalizeQuotesForRfq(rfqId, { now: receivedAt });
    const mine = result.results.find(r => r.quoteId === quoteId);
    normalized = {
      landedTotalCost: mine?.landedTotalCost ?? null,
      rank: mine?.rank ?? null,
      warnings: mine?.warnings.length ?? 0,
    };
  } catch (error) {
    console.warn("[VendorQuoteParser] Normalization after ingest failed:", error);
  }

  return { ...base, success: true, quoteId, normalized };
}
