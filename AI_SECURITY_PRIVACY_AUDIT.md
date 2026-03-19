# AI Security & Privacy Audit Report

**Date:** 2026-03-19
**Scope:** Full codebase review of AI/ML security and privacy controls
**Verdict:** Several critical gaps exist that need immediate attention

---

## Executive Summary

The system has **basic security foundations** (authentication, rate limiting, security headers, encryption) but has **significant gaps in AI-specific security controls**. The AI agent has broad, unscoped database access, no prompt injection defenses, no data classification/masking, no AI-specific audit trail, and no privacy compliance framework.

**Risk Level: HIGH** — The AI can access all ERP data and take actions (send emails, create POs) with minimal guardrails.

---

## What's Already in Place (Strengths)

| Control | Status | Location |
|---------|--------|----------|
| Authentication (email/password) | Present | `server/_core/localAuth.ts` |
| Password hashing (PBKDF2, SHA-512, 100k iterations) | Strong | `server/_core/localAuth.ts:73` |
| Login rate limiting (5 attempts/15min) | Present | `server/_core/localAuth.ts:22` |
| API rate limiting (200 req/min) | Present | `server/_core/index.ts:69` |
| Security headers (X-Frame, HSTS, nosniff, XSS) | Present | `server/_core/index.ts:52-62` |
| AES-256-CBC encryption with random IV | Present | `server/_core/crypto.ts` |
| Webhook signature verification (SendGrid, Shopify) | Present | `server/_core/index.ts:133,183` |
| tRPC protected/admin procedures (RBAC) | Present | `server/_core/trpc.ts` |
| OAuth state validation (Shopify, QuickBooks) | Present | `server/_core/index.ts:282-292` |
| Approval workflow for sensitive AI actions | Partial | `server/autonomousWorkflowEngine.ts:415` |
| Token encryption for third-party integrations | Present | `server/_core/index.ts:302` |
| Environment variable isolation | Present | `server/_core/env.ts` |

---

## Critical Gaps & Risks

### 1. NO PROMPT INJECTION PROTECTION (Critical)

**File:** `server/aiAgentService.ts:1256-1301`

User messages are passed directly into LLM prompts with zero sanitization. An attacker could inject instructions to:
- Exfiltrate data by asking the AI to email database contents to an external address
- Bypass approval workflows by manipulating the AI's tool-calling behavior
- Modify business data by tricking the AI into making unauthorized changes

```typescript
// Current: Raw user input goes directly to LLM
const messages: Message[] = [
  { role: "system", content: systemPrompt },
  ...conversationHistory,  // No sanitization
  { role: "user", content: message },  // No sanitization
];
```

**Recommendation:** Add input sanitization, prompt boundary markers, and output validation before executing tool calls.

---

### 2. AI HAS UNRESTRICTED DATABASE ACCESS (Critical)

**File:** `server/aiAgentService.ts:407-579`

The AI agent's tool execution functions query the database with no row-level security, no tenant isolation, and no data scoping. Any authenticated user can ask the AI to retrieve ALL vendors, customers, orders, financial data, etc.

- `executeAnalyzeData()` — fetches all orders, inventory, invoices with no user/company filtering
- `executeManageVendor()` — can list/search/create/update any vendor
- `executeSendEmail()` — can send emails to any address the AI decides

**Recommendation:** Add company/tenant scoping to all AI tool queries. Enforce row-level access based on the user's role and company.

---

### 3. AI CAN SEND EMAILS WITHOUT APPROVAL (Critical)

**File:** `server/aiAgentService.ts:581-640`

The `send_email` tool executes immediately — it actually sends the email — while other destructive operations like `update_inventory` and `create_purchase_order` correctly create approval tasks. This inconsistency means the AI can be tricked into sending emails with sensitive data to arbitrary addresses.

**Recommendation:** Route all email-sending through the approval workflow, or at minimum restrict recipients to known contacts in the database.

---

### 4. NO AI INTERACTION AUDIT LOGGING (High)

**File:** `server/aiAgentService.ts:1239-1414`

The main `processAIAgentRequest()` function does not log:
- What the user asked
- What data the AI accessed
- What tools were called and with what parameters
- What the AI responded with

The `aiAgentLogs` table exists but is only used when `create_task` is called (line 1181). All other AI interactions are unaudited.

**Recommendation:** Log every AI interaction including: user input, tools invoked, data accessed, responses generated, and any actions taken.

---

### 5. NO DATA CLASSIFICATION OR PII MASKING (High)

The AI has access to:
- Customer emails, phone numbers, contact names
- Vendor financial data
- Invoice amounts and payment details
- Employee information

None of this data is classified, masked, or redacted before being sent to the external LLM API. All ERP data flows through to the third-party AI provider (Gemini via `forge.manus.im`).

**Recommendation:** Implement data classification, PII detection, and masking before sending data to external LLM APIs. Consider using a self-hosted model for sensitive operations.

---

### 6. LLM API KEY EXPOSURE RISK (High)

**File:** `server/_core/llm.ts:324-330`

The API key is sent in every request to an external endpoint (`forge.manus.im`). There is:
- No key rotation mechanism
- No separate keys for different environments
- No monitoring of API key usage
- The API URL is hardcoded as a fallback

**Recommendation:** Implement API key rotation, usage monitoring, and environment-specific keys.

---

### 7. AUTONOMOUS WORKFLOW ENGINE LACKS GUARDRAILS (High)

**File:** `server/autonomousWorkflowEngine.ts`

The autonomous workflow engine can:
- Make AI decisions with no human oversight when confidence > threshold
- Auto-approve financial transactions below configured thresholds (default: $500)
- Execute 18+ different workflow types autonomously

The default auto-approve threshold of $500 (`line 433`) with no configured thresholds means small but frequent transactions could accumulate significant exposure.

**Recommendation:** Require explicit threshold configuration, add cumulative spend limits, and implement anomaly detection.

---

### 8. NO CONTENT SECURITY POLICY (CSP) HEADER (Medium)

**File:** `server/_core/index.ts:52-62`

Security headers are set but CSP is missing. This leaves the frontend vulnerable to XSS attacks that could interact with AI features.

**Recommendation:** Add a Content-Security-Policy header.

---

### 9. NO GDPR/PRIVACY COMPLIANCE FRAMEWORK (Medium)

There are no mechanisms for:
- Data subject access requests (DSAR)
- Right to deletion/erasure
- Consent management for AI processing
- Data retention policies
- Cross-border data transfer controls (data flows to external AI APIs)

**Recommendation:** Implement a privacy compliance module with DSAR handling, consent tracking, and data retention policies.

---

### 10. SESSION TOKENS LAST ONE YEAR (Medium)

**File:** `server/_core/localAuth.ts:186,189`

Session tokens have a `ONE_YEAR_MS` expiry with no refresh mechanism. Compromised sessions remain valid for up to a year.

**Recommendation:** Reduce session duration, implement token refresh, and add session revocation capability.

---

### 11. NO OUTPUT VALIDATION FROM LLM (Medium)

**File:** `server/aiAgentService.ts:1332-1352`

Tool arguments from the LLM are parsed from JSON but not validated against schemas. A malformed or manipulated LLM response could pass unexpected parameters to tool execution functions.

**Recommendation:** Validate all LLM tool call arguments against their defined schemas before execution.

---

### 12. CONVERSATION HISTORY PASSED WITHOUT LIMITS (Low)

**File:** `server/aiAgentService.ts:1297-1301`

The entire `conversationHistory` array is passed to the LLM with no size limit. This could lead to context window overflow, increased costs, and potential data leakage if old conversations contain sensitive data.

**Recommendation:** Limit conversation history to recent messages and implement message expiration.

---

## Priority Action Items

### Immediate (Week 1)
1. **Add prompt injection defenses** — input sanitization, output validation
2. **Route email sending through approval workflow** — prevent AI from sending unauthorized emails
3. **Add comprehensive AI audit logging** — log all AI interactions, tool calls, and data access

### Short-term (Weeks 2-4)
4. **Implement tenant/company scoping** on all AI tool queries
5. **Add PII detection and masking** before sending data to external LLM
6. **Validate LLM tool call arguments** against schemas
7. **Add CSP header** and review frontend XSS exposure
8. **Reduce session duration** and add refresh tokens

### Medium-term (Months 2-3)
9. **Implement GDPR/privacy compliance module** (DSAR, consent, retention)
10. **Add API key rotation and monitoring**
11. **Implement cumulative spend limits** for auto-approved transactions
12. **Evaluate self-hosted LLM** for sensitive data operations
13. **Add anomaly detection** for AI behavior patterns

---

## Architecture Recommendations

### Data Flow Security
```
User Input → [Sanitize] → [Classify Data] → [Mask PII] → LLM API → [Validate Output] → [Check Permissions] → Execute
```

### Recommended New Modules
- `server/_core/aiSanitizer.ts` — Input/output sanitization for AI interactions
- `server/_core/dataClassification.ts` — PII detection and data masking
- `server/_core/aiAuditLog.ts` — Comprehensive AI interaction logging
- `server/_core/privacyCompliance.ts` — GDPR/CCPA compliance utilities
