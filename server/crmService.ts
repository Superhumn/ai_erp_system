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

export async function loadScopedAccount(id: number, scope: Scope) {
  const row = await db.getCrmAccountById(id);
  if (!row || !crmRowVisible(scope, row.companyId)) notFound("Account");
  return row;
}

/**
 * Validates a parent assignment: the parent must be visible, must not be the
 * account itself, and must not be one of its descendants (no cycles).
 */
export async function assertValidParentAccount(accountId: number | null, parentAccountId: number, scope: Scope): Promise<void> {
  if (accountId != null && parentAccountId === accountId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "An account cannot be its own parent" });
  }
  let cursor: number | null = parentAccountId;
  const seen = new Set<number>();
  while (cursor != null) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const parent = await loadScopedAccount(cursor, scope);
    if (accountId != null && parent.parentAccountId === accountId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That parent is a child of this account" });
    }
    cursor = parent.parentAccountId ?? null;
  }
}

/** Account detail: the row plus parent, children, contacts, deals and a merged timeline. */
export async function getAccountDetail(id: number, scope: Scope) {
  const account = await loadScopedAccount(id, scope);
  const companyIds = crmScopeCompanyIds(scope);
  const [parent, children, contacts, deals] = await Promise.all([
    account.parentAccountId ? db.getCrmAccountById(account.parentAccountId) : Promise.resolve(undefined),
    db.getCrmAccountChildren(id),
    db.getCrmContacts({ accountId: id, companyIds, limit: 500 }),
    db.getCrmDeals({ accountId: id, companyIds, limit: 500 }),
  ]);
  const timeline = contacts.length
    ? (await Promise.all(contacts.map((c) => db.getCrmInteractions({ contactId: c.id, limit: 20 }))))
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 50)
    : [];
  return { ...account, parent: parent && crmRowVisible(scope, parent.companyId) ? parent : null, children, contacts, deals, timeline };
}

/** Allow-list for list helpers (`null` = unrestricted). */
export function scopeIds(scope: Scope): number[] | null {
  return crmScopeCompanyIds(scope);
}
