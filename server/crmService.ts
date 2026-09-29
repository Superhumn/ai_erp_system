/**
 * CRM feature logic. Routers in server/routers/crm.ts call these; the pure
 * rules live in server/crmLogic.ts so they can be tested without a DB.
 *
 * Every by-id loader here answers NOT_FOUND (never FORBIDDEN) for a row that
 * exists but belongs to an entity outside the caller's scope — confirming a
 * record exists would leak another entity's data.
 */
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import type { Scope } from "./_core/scope";
import { crmRowVisible, crmScopeCompanyIds } from "./crmLogic";

export type CrmScope = Scope;

function notFound(what: string): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `${what} not found` });
}

// ---------------------------------------------------------------------------
// Scoped by-id loaders
// ---------------------------------------------------------------------------

export async function loadScopedContact(id: number, scope: Scope) {
  const row = await db.getCrmContactById(id);
  if (!row || !crmRowVisible(scope, row.companyId)) notFound("Contact");
  return row;
}

export async function loadScopedContactByEmail(email: string, scope: Scope) {
  const row = await db.getCrmContactByEmail(email);
  if (!row || !crmRowVisible(scope, row.companyId)) return undefined;
  return row;
}

export async function loadScopedDeal(id: number, scope: Scope) {
  const row = await db.getCrmDealById(id);
  if (!row || !crmRowVisible(scope, row.companyId)) notFound("Deal");
  return row;
}

export async function loadScopedPipeline(id: number, scope: Scope) {
  const row = await db.getCrmPipelineById(id);
  if (!row || !crmRowVisible(scope, row.companyId, { sharedWhenNull: true })) notFound("Pipeline");
  return row;
}

export async function loadScopedTag(id: number, scope: Scope) {
  const row = await db.getCrmTagById(id);
  if (!row || !crmRowVisible(scope, row.companyId, { sharedWhenNull: true })) notFound("Tag");
  return row;
}

export async function loadScopedCapture(id: number, scope: Scope) {
  const row = await db.getContactCaptureById(id);
  if (!row || !crmRowVisible(scope, row.companyId)) notFound("Capture");
  return row;
}

/** Allow-list for list helpers (`null` = unrestricted). */
export function scopeIds(scope: Scope): number[] | null {
  return crmScopeCompanyIds(scope);
}
