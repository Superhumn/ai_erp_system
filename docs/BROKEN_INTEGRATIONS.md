# Broken & Non-Functional Integrations Audit

**Date:** 2026-04-12
**Branch:** `claude/identify-broken-integrations-GVI70`

---

## Critical — Completely Non-Functional

### 1. Supply Chain Workflow Engine
**Files:** `server/autonomousWorkflowEngine.ts`, `server/supplyChainOrchestrator.ts`, `server/workflowProcessors.ts`, `server/autonomousWorkflowRouter.ts`

All supply chain workflow tables (`supplyChainWorkflows`, `workflowRuns`, `workflowSteps`, `workflowApprovalQueue`, `autonomousDecisions`, `supplyChainEvents`, `workflowMetrics`, `approvalThresholds`, `exceptionRules`, `exceptionLog`, `supplierPerformance`, `workflowNotifications`) were **removed from the Drizzle schema** but the code still references them through `{} as any` stubs. All queries return empty results at runtime.

```typescript
// server/autonomousWorkflowEngine.ts:3-16
// [Workflow] Supply chain workflow tables were removed from drizzle/schema.
// These stubs allow the engine to compile; queries will return empty results at runtime.
const supplyChainWorkflows: any = {} as any;
const workflowRuns: any = {} as any;
// ... 10 more stub tables
```

**Impact:** Autonomous workflow execution, approval queues, supply chain event processing, exception handling, and supplier performance tracking are all non-functional.

---

### 2. Due Diligence / Checklists (Data Room)
**File:** `server/db/dataRoom.ts:17-35`

Due diligence templates, categories, items, and checklist tables are **placeholder stubs set to `null`**. The schema tables were never created.

```typescript
const dueDiligenceTemplates: any = null;
const dueDiligenceCategories: any = null;
const dueDiligenceItems: any = null;
const dataRoomChecklists: any = null;
const dataRoomChecklistItems: any = null;
```

**Impact:** Due diligence checklist features in the Data Room module will throw at runtime when any CRUD operation is attempted.

---

### 3. Mercury Banking API
**File:** `server/mercuryService.ts:7-8`

The service throws immediately if `MERCURY_API_TOKEN` is not set — **no graceful degradation**.

```typescript
if (!token) throw new Error("MERCURY_API_TOKEN not configured");
```

Additionally, `MERCURY_API_TOKEN` is **missing from `.env.example`**, so new deployments won't know it exists. The router at `server/routers.ts:19714` conditionally loads this service but the Banking UI (`client/src/pages/finance/Banking.tsx`) will display a hard error.

**Impact:** Banking integration crashes if called without the env var.

---

## High — Stub or Incomplete Implementations

### 4. AS2 EDI Transport
**File:** `server/ediTransportService.ts:216` (header comment: `// AS2 TRANSPORT (STUB)`)

The AS2 implementation uses basic HTTP POST with AS2-style headers but lacks:
- Proper S/MIME encryption and signing
- MDN (Message Disposition Notification) receipt handling
- Certificate/key management
- Full AS2 protocol compliance

It will connect to endpoints but is not a production-ready AS2 implementation.

---

### 5. Supplier Performance Tracking
**Files:** `server/agent/tools/adapters/db.ts:33`, `server/workflowProcessors.ts:41`

The `supplierPerformance` table was removed from the schema. The agent tool and workflow processors reference it via stubs.

---

### 6. SFTP for EDI (Optional Dependency)
**File:** `server/ediTransportService.ts:63-69`

SFTP transport requires `ssh2-sftp-client` which is loaded dynamically. If the package is not installed, all SFTP operations return:

```typescript
{ success: false, message: "ssh2-sftp-client package not installed" }
```

---

## Medium — Requires Configuration (Empty Defaults)

These integrations are fully implemented but **disabled by default** because their required environment variables are empty in `.env.example`. They fail gracefully with error messages.

| # | Integration | Required Env Vars | Error Behavior |
|---|------------|-------------------|----------------|
| 7 | **SendGrid Email** | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | Worker prints "SendGrid not configured - worker disabled" |
| 8 | **QuickBooks** | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` | Returns `{ error: "QuickBooks integration is not configured..." }` |
| 9 | **Shopify** | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | Throws TRPCError: "Shopify integration is not configured" |
| 10 | **Twilio Voice/SMS** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Returns `{ success: false, error: "Twilio not configured..." }` |
| 11 | **Google OAuth** (Drive, Gmail, Calendar, Workspace) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Throws TRPCError: "Google OAuth not configured" |
| 12 | **IMAP Inbox** | `IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD` | Returns "IMAP not configured" error |
| 13 | **Fireflies.ai** | Per-user API key via settings | Throws TRPCError: "Fireflies not configured" |
| 14 | **Airtable** | `AIRTABLE_PERSONAL_ACCESS_TOKEN` | Throws: "Airtable Personal Access Token not configured" |
| 15 | **API Proxy** (Image Gen, Voice Transcription, Maps) | `API_PROXY_URL`, `API_PROXY_KEY` | Throws: "API_PROXY_URL is not configured" |
| 16 | **Sentry Error Tracking** | `SENTRY_DSN` + `@sentry/node` package | Silently falls back to stdout logging |

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| **Critical** | 3 | Schema tables removed but code still references them via stubs; Mercury has no fallback |
| **High** | 3 | AS2 is a stub, supplier performance removed, SFTP is optional dep |
| **Medium** | 11 | Config-gated integrations — work when configured, fail gracefully |

**Recommended priorities:**
1. Restore supply chain workflow tables to the Drizzle schema or remove the dead code
2. Add `MERCURY_API_TOKEN` to `.env.example` and add graceful degradation
3. Create the due diligence schema tables or remove the feature
4. Decide on AS2 EDI: either implement properly or document the limitation
