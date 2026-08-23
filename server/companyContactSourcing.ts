/**
 * Company Contact Sourcing — applying a website read to a record
 *
 * `server/companyWebsiteSource.ts` reads a company's site and returns what it
 * found, with a URL behind every value. This module decides what that means for
 * the stored vendor or carrier record, and writes the audit row.
 *
 * The promotion rule is narrow on purpose:
 *
 *   contactSource becomes "website" — and contactVerifiedAt is set — only when an
 *   email on the company's own domain was found. Everything else leaves the record
 *   where it was.
 *
 * So a carrier a model proposed stays `discovered` until its own website confirms
 * it. A phone number alone does not promote it; a directory listing does not
 * promote it; a site that 404s does not promote it. `discovered` is the state that
 * `freight.rfqs.sendToCarriers` refuses to mail, which is the whole point of
 * tracking it.
 *
 * Existing details are never silently overwritten by a weaker source: a human-typed
 * email stays unless `overwriteExisting` is set, in which case the website value
 * wins because the website is the better authority.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db/connection";
import { companyWebSources, freightCarriers, vendors } from "../drizzle/schema";
import {
  chooseContactPatch,
  sourceContactsFromWebsite,
  type WebsiteSourceResult,
} from "./companyWebsiteSource";

export type SourceableEntity = "vendor" | "freight_carrier";

export interface SourceCompanyContactsInput {
  entityType: SourceableEntity;
  entityId: number;
  /** Overrides the website stored on the record. */
  website?: string;
  /** Replace details that are already present. Off by default. */
  overwriteExisting?: boolean;
  requestedBy?: number;
  maxPages?: number;
}

export interface SourceCompanyContactsResult {
  entityType: SourceableEntity;
  entityId: number;
  status: WebsiteSourceResult["status"] | "no_website";
  /** True when an own-domain email was found and the record is now verified. */
  verified: boolean;
  /** Fields actually written to the record. */
  applied: Record<string, string | null>;
  /** Fields found but not written, with the reason. */
  skipped: Array<{ field: string; reason: string }>;
  source: WebsiteSourceResult | null;
  logId: number | null;
}

/** The current contact state of a vendor or carrier row. */
export interface ContactRecordState {
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  contactSource?: string | null;
}

export interface ContactUpdatePlan {
  /** Columns to write. Empty when the read changed nothing. */
  patch: Record<string, unknown>;
  applied: Record<string, string | null>;
  skipped: Array<{ field: string; reason: string }>;
  verified: boolean;
}

/**
 * Decide what a website read means for a record — the whole judgement of this
 * module, kept free of the database so it can be tested directly.
 */
export function planContactUpdate(
  entity: ContactRecordState,
  result: WebsiteSourceResult,
  options: { overwriteExisting?: boolean } = {},
): ContactUpdatePlan {
  const patchCandidate = chooseContactPatch(result);
  const applied: Record<string, string | null> = {};
  const skipped: Array<{ field: string; reason: string }> = [];
  const patch: Record<string, unknown> = {};

  // Keep the website we actually used, so a bare domain becomes a real URL.
  if (result.websiteUrl && result.websiteUrl !== entity.website) {
    patch.website = result.websiteUrl;
    applied.website = result.websiteUrl;
  }

  const fields: Array<["email" | "phone" | "address", string | null]> = [
    ["email", patchCandidate.email],
    ["phone", patchCandidate.phone],
    ["address", patchCandidate.address],
  ];

  for (const [field, value] of fields) {
    if (!value) {
      // Distinguish "the site had nothing" from "the site had something we rejected".
      const foundOffDomain =
        field === "email" && result.contacts.emails.some(e => !e.onOwnDomain);
      if (foundOffDomain) {
        skipped.push({
          field,
          reason: "Only found on a domain other than the company's own; not trusted.",
        });
      }
      continue;
    }
    const existing = entity[field];
    if (existing && !options.overwriteExisting) {
      skipped.push({ field, reason: `Already set to "${existing}"; kept existing value.` });
      continue;
    }
    patch[field] = value;
    applied[field] = value;
  }

  // Promotion happens only on an own-domain email.
  if (patchCandidate.verified) {
    patch.contactSource = "website";
    patch.contactVerifiedAt = new Date();
    patch.contactSourceUrl = patchCandidate.sourceUrl;
    applied.contactSource = "website";
  } else if (entity.contactSource === "discovered") {
    skipped.push({
      field: "contactSource",
      reason:
        "No email on the company's own domain was found, so this record stays unverified " +
        "and cannot be sent an RFQ.",
    });
  }

  return { patch, applied, skipped, verified: patchCandidate.verified };
}

/** Read the record's current contact state, whichever table it lives in. */
async function loadEntity(entityType: SourceableEntity, entityId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (entityType === "vendor") {
    const rows = await db.select().from(vendors).where(eq(vendors.id, entityId)).limit(1);
    return rows[0] ?? null;
  }
  const rows = await db.select().from(freightCarriers).where(eq(freightCarriers.id, entityId)).limit(1);
  return rows[0] ?? null;
}

async function applyPatch(
  entityType: SourceableEntity,
  entityId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (Object.keys(patch).length === 0) return;

  if (entityType === "vendor") {
    await db.update(vendors).set(patch as any).where(eq(vendors.id, entityId));
  } else {
    await db.update(freightCarriers).set(patch as any).where(eq(freightCarriers.id, entityId));
  }
}

/**
 * Fetch the company's website, decide what to write, write it, and log the attempt.
 *
 * Never throws for an unreachable site — a carrier whose website is down is a
 * normal outcome, recorded as `fetch_failed`, not an error the caller must catch.
 */
export async function sourceCompanyContacts(
  input: SourceCompanyContactsInput,
): Promise<SourceCompanyContactsResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const entity = await loadEntity(input.entityType, input.entityId);
  if (!entity) {
    throw new Error(`${input.entityType} ${input.entityId} not found`);
  }

  const website = (input.website ?? (entity as any).website ?? "").trim();
  if (!website) {
    return {
      entityType: input.entityType,
      entityId: input.entityId,
      status: "no_website",
      verified: false,
      applied: {},
      skipped: [{ field: "website", reason: "No website on this record to read from." }],
      source: null,
      logId: null,
    };
  }

  const result = await sourceContactsFromWebsite(website, { maxPages: input.maxPages });
  const { patch, applied, skipped, verified } = planContactUpdate(
    entity as ContactRecordState,
    result,
    { overwriteExisting: input.overwriteExisting },
  );

  await applyPatch(input.entityType, input.entityId, patch);

  const inserted = await db.insert(companyWebSources).values({
    entityType: input.entityType,
    entityId: input.entityId,
    websiteUrl: result.websiteUrl,
    fetchedUrl: result.fetchedUrl,
    httpStatus: result.httpStatus,
    status: result.status,
    extracted: JSON.stringify(result.contacts),
    warnings: JSON.stringify(result.warnings),
    pagesFetched: result.pagesFetched,
    durationMs: result.durationMs,
    error: result.error ?? null,
    requestedBy: input.requestedBy ?? null,
  });

  return {
    entityType: input.entityType,
    entityId: input.entityId,
    status: result.status,
    verified,
    applied,
    skipped,
    source: result,
    logId: (inserted as any)[0]?.insertId ?? null,
  };
}

/** Sourcing history for one record, newest first. */
export async function getCompanyWebSources(
  entityType: SourceableEntity,
  entityId: number,
  limit = 20,
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(companyWebSources)
    .where(and(eq(companyWebSources.entityType, entityType), eq(companyWebSources.entityId, entityId)))
    .orderBy(desc(companyWebSources.createdAt))
    .limit(limit);
}

/**
 * Source several records in sequence.
 *
 * Deliberately serial: this makes outbound requests to third-party sites, and a
 * burst of parallel fetches against one company's infrastructure is how you get
 * rate-limited or blocked. A failure on one record never stops the rest.
 */
export async function sourceCompanyContactsBatch(
  entries: Array<{ entityType: SourceableEntity; entityId: number }>,
  options: { overwriteExisting?: boolean; requestedBy?: number } = {},
): Promise<{
  results: SourceCompanyContactsResult[];
  verifiedCount: number;
  failedCount: number;
}> {
  const results: SourceCompanyContactsResult[] = [];
  for (const entry of entries) {
    try {
      results.push(
        await sourceCompanyContacts({
          ...entry,
          overwriteExisting: options.overwriteExisting,
          requestedBy: options.requestedBy,
        }),
      );
    } catch (e) {
      results.push({
        entityType: entry.entityType,
        entityId: entry.entityId,
        status: "fetch_failed",
        verified: false,
        applied: {},
        skipped: [{ field: "*", reason: e instanceof Error ? e.message : "Sourcing failed" }],
        source: null,
        logId: null,
      });
    }
  }
  return {
    results,
    verifiedCount: results.filter(r => r.verified).length,
    failedCount: results.filter(r => !r.verified).length,
  };
}
