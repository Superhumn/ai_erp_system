# Security Audit Report - AI ERP System

**Date:** 2026-02-27
**Scope:** Full codebase security scan
**Auditor:** Automated security analysis

---

## Executive Summary

A comprehensive security scan of the AI ERP System codebase identified **28 security issues** across 7 categories. Of these, **5 are CRITICAL**, **11 are HIGH**, **8 are MEDIUM**, and **4 are LOW** severity. The most urgent issues involve weak cryptographic practices (SHA-256 password hashing, static IV encryption, `Math.random()` for tokens), multiple XSS vulnerabilities in email rendering, and SSRF exposure through unvalidated URLs.

### Risk Score: HIGH

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 11 |
| MEDIUM | 8 |
| LOW | 4 |

---

## CRITICAL Findings

### C1: Weak Password Hashing (SHA-256 without Salt)

**CWE-916: Use of Password Hash With Insufficient Computational Effort**

| Detail | Value |
|--------|-------|
| File | `server/routers.ts` |
| Lines | 9607, 9649, 9838, 10219 |
| CVSS | 9.1 |

```typescript
hashedPassword = crypto.createHash('sha256').update(input.password).digest('hex');
```

Passwords are hashed with plain SHA-256 — no salt, no key stretching, no iterations. SHA-256 is a fast hash designed for data integrity, not password storage. An attacker with a leaked database can crack passwords using rainbow tables or GPU-accelerated brute force at billions of hashes per second.

**Recommendation:** Replace with `bcrypt` (12+ rounds), `scrypt`, or `Argon2id`.

---

### C2: Static Zero IV for AES-256-CBC Encryption

**CWE-329: Generation of Predictable IV with CBC Mode**

| Detail | Value |
|--------|-------|
| File | `server/routers.ts` |
| Lines | 10445, 10505, 10560, 10605, 10653 |
| CVSS | 8.6 |

```typescript
const cipher = crypto.createCipheriv('aes-256-cbc',
  crypto.createHash('sha256').update(key).digest().slice(0, 32),
  Buffer.alloc(16, 0)  // All-zeros IV
);
```

AES-CBC with a static zero IV is fundamentally broken. Identical plaintexts produce identical ciphertexts, enabling pattern analysis. This is used for encrypting IMAP/email passwords stored in the database.

**Recommendation:** Generate a random 16-byte IV per encryption via `crypto.randomBytes(16)` and prepend it to the ciphertext.

---

### C3: Hardcoded Fallback Encryption Key

**CWE-798: Use of Hard-coded Credentials**

| Detail | Value |
|--------|-------|
| File | `server/routers.ts` |
| Lines | 10442, 10502, 10557, 10602, 10650 |
| CVSS | 9.0 |

```typescript
const key = process.env.JWT_SECRET || 'default-key';
```

Five locations fall back to the hardcoded string `'default-key'` when `JWT_SECRET` is not set. Anyone with source code access can decrypt all stored email credentials.

**Recommendation:** Fail at startup if `JWT_SECRET` is not set. Never use a hardcoded default for encryption keys.

---

### C4: Math.random() for Security Tokens

**CWE-330: Use of Insufficiently Random Values**

| Detail | Value |
|--------|-------|
| File | `server/routers.ts` |
| Lines | 11249 |
| CVSS | 8.1 |

```typescript
const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
```

`Math.random()` is not cryptographically secure. Session tokens generated this way are predictable and can be brute-forced. Also used for team invitation codes in `server/db.ts:2164`.

**Recommendation:** Use `crypto.randomBytes()` or `crypto.randomUUID()`.

---

### C5: Unsanitized External Email HTML Rendering (Stored XSS)

**CWE-79: Improper Neutralization of Input During Web Page Generation**

| Detail | Value |
|--------|-------|
| File | `client/src/components/SentEmailsTab.tsx` |
| Line | 223 |
| CVSS | 8.8 |

```tsx
dangerouslySetInnerHTML={{ __html: emailDetail.bodyHtml }}
```

External email HTML from arbitrary senders (ingested via IMAP scanning) is rendered directly in the browser without any sanitization. An attacker can send a crafted email containing `<script>`, `<img onerror="...">`, or `<svg onload="...">` payloads to execute JavaScript in the context of a logged-in ERP user's session, leading to full account takeover.

**Recommendation:** Sanitize with DOMPurify (already in `package.json`): `DOMPurify.sanitize(emailDetail.bodyHtml)`.

---

## HIGH Findings

### H1: SSRF via User-Controlled Shopify Domain

**CWE-918: Server-Side Request Forgery**

| Detail | Value |
|--------|-------|
| File | `server/routers.ts` |
| Lines | 303-313 |

```typescript
const response = await fetch(`https://${shopifyStoreDomain}/admin/api/2024-01/customers.json`, { ... });
```

The `shopifyStoreDomain` parameter is user-controlled and directly interpolated into a `fetch()` URL without validation. An attacker can supply `localhost`, internal IPs, or cloud metadata endpoints (169.254.169.254) to access internal services.

**Recommendation:** Validate against an allowlist of known Shopify domains (must match `*.myshopify.com`) or resolve DNS and reject private IP ranges.

---

### H2: SSRF via User-Controlled File URLs in Document Processing

**CWE-918: Server-Side Request Forgery**

| Detail | Value |
|--------|-------|
| File | `server/documentImportService.ts` |
| Lines | 306-310, 337-341 |

```typescript
const response = await fetch(fileUrl);  // fileUrl is user-controlled
```

**Recommendation:** Validate URL scheme (HTTPS only), resolve hostname, and reject private/reserved IP ranges.

---

### H3: SSRF via Voice Transcription Audio URL

| Detail | Value |
|--------|-------|
| File | `server/_core/voiceTranscription.ts` |
| Lines | 97, 155 |

Same pattern as H2 — user-controlled `audioUrl` passed directly to `fetch()`.

---

### H4: Stored XSS in HTML Email Templates

**CWE-79: Cross-Site Scripting**

| Detail | Value |
|--------|-------|
| File | `server/routers.ts` |
| Lines | 803, 858-875, 1806-1821 |

User input (`input.message`, `item.description`, `customer.name`, `invoice.notes`) is interpolated directly into HTML email templates without escaping:

```typescript
${input.message ? `<p>${input.message}</p>` : ''}
```

**Recommendation:** Create and apply an `escapeHtml()` utility to all interpolated values, or use a templating engine with auto-escaping (e.g., Handlebars).

---

### H5: Stored XSS in PDF Generation (Puppeteer Context)

**CWE-79: Cross-Site Scripting**

| Detail | Value |
|--------|-------|
| File | `server/_core/invoicePdf.ts` |
| Lines | 119, 266-311, 376-377 |

Database fields (`item.description`, `company.name`, `invoice.notes`, `invoice.terms`) are injected into HTML rendered by Puppeteer. Malicious content could lead to SSRF via Puppeteer (e.g., `<iframe src="file:///etc/passwd">`).

**Recommendation:** Escape all interpolated values in the PDF HTML template.

---

### H6: 1-Year JWT Expiration

**CWE-613: Insufficient Session Expiration**

| Detail | Value |
|--------|-------|
| File | `shared/const.ts`, `server/_core/sdk.ts` |
| Lines | const.ts:2, sdk.ts:186 |

```typescript
const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS; // 365 days
```

A compromised JWT remains valid for an entire year.

**Recommendation:** Use short-lived access tokens (15 min - 1 hour) with a refresh token mechanism.

---

### H7: Missing CSRF Protection

| Detail | Value |
|--------|-------|
| File | `server/_core/index.ts` |

No CSRF middleware is configured. Combined with `sameSite: "none"` cookies (H8), this enables cross-site request forgery attacks.

**Recommendation:** Add CSRF token validation or change cookie `sameSite` to `"lax"`.

---

### H8: Weak Cookie SameSite Setting

**CWE-352: Cross-Site Request Forgery**

| Detail | Value |
|--------|-------|
| File | `server/_core/cookies.ts` |
| Line | 45 |

```typescript
sameSite: "none",
```

`sameSite: "none"` allows cookies to be sent with cross-site requests, enabling CSRF.

**Recommendation:** Change to `sameSite: "lax"` unless cross-site auth is specifically required.

---

### H9: No Rate Limiting on Authentication Endpoints

| Detail | Value |
|--------|-------|
| File | `server/_core/index.ts`, `server/routers.ts` |

No `express-rate-limit` or equivalent middleware found. Login, password reset, invitation code checking, and data room password endpoints are vulnerable to brute-force attacks.

**Recommendation:** Add rate limiting middleware (e.g., `express-rate-limit`) on all auth-related endpoints.

---

### H10: Missing Authentication on Sensitive Public Endpoints

| Detail | Value |
|--------|-------|
| File | `server/routers.ts` |
| Lines | 5867, 10185, 10276, 10391, 10761, 10831 |

Multiple `publicProcedure` endpoints expose sensitive operations:
- `checkCode` (line 5867): Validates invitation codes, leaks email/role
- `accessByLink` (line 10185): Data room access with brute-forceable passwords
- `getContent` (line 10276): Returns data room contents without proper visitor-to-room authorization

**Recommendation:** Add authentication requirements or implement proper authorization checks with rate limiting.

---

### H11: formatEmailHtml() Performs No Sanitization

| Detail | Value |
|--------|-------|
| File | `server/_core/email.ts` |
| Lines | 134-171 |

The primary email formatting function passes all input through to HTML without any encoding. Used throughout the codebase for generating outbound emails.

**Recommendation:** Apply HTML entity encoding to input before wrapping in HTML tags.

---

## MEDIUM Findings

### M1: Missing Security Headers

| Detail | Value |
|--------|-------|
| File | `server/_core/index.ts` |

No `helmet.js` or manual security headers configured. Missing: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, Referrer-Policy.

**Recommendation:** Add `helmet` middleware.

---

### M2: 50MB Body Parser Limit

| Detail | Value |
|--------|-------|
| File | `server/_core/index.ts` |
| Lines | 49-50 |

```typescript
app.use(express.json({ limit: "50mb" }));
```

Enables denial-of-service by memory exhaustion.

**Recommendation:** Reduce to 10MB for JSON. Use multipart/form-data streaming for large file uploads.

---

### M3: URL Parameter Injection in Google Drive API Calls

| Detail | Value |
|--------|-------|
| File | `server/routers.ts` |
| Lines | 3116, 12034, 12109 |

`pageToken` parameter is interpolated into URLs without `encodeURIComponent()`:

```typescript
const url = `...&pageToken=${input.pageToken}`;
```

**Recommendation:** Use `encodeURIComponent(input.pageToken)` or `URLSearchParams`.

---

### M4: Weak Encryption Key Derivation

| Detail | Value |
|--------|-------|
| File | `server/_core/crypto.ts` |
| Line | 20 |

SHA-256 used for key derivation (single iteration, no salt).

**Recommendation:** Use `crypto.pbkdf2` or `crypto.scrypt` with proper parameters.

---

### M5: Optional Webhook Signature Verification

| Detail | Value |
|--------|-------|
| File | `server/_core/index.ts` |
| Lines | 57-83 |

SendGrid webhook verification only happens if `sendgridWebhookSecret` is configured. Without it, any payload is accepted.

**Recommendation:** Make webhook signature verification mandatory in production.

---

### M6: Weak OAuth State Validation

| Detail | Value |
|--------|-------|
| File | `server/_core/index.ts` |
| Lines | 204-207 |

Google OAuth state parameter is a plain user ID with no cryptographic signature. An attacker can forge state values.

**Recommendation:** Use HMAC-signed or JWT-encoded state parameters.

---

### M7: Missing appId Verification in Session Token Validation

| Detail | Value |
|--------|-------|
| File | `server/_core/sdk.ts` |
| Lines | 213-222 |

JWT payload `appId` is checked for existence but not verified against the expected application ID.

**Recommendation:** Add `if (appId !== ENV.appId) return null;`.

---

### M8: NDA Signing Input in HTML Email Without Escaping

| Detail | Value |
|--------|-------|
| File | `server/routers.ts` |
| Lines | 10929-10942 |

`input.signerName`, `input.signerTitle`, `input.signerCompany` from public (unauthenticated) NDA signing flow are interpolated into HTML email sent to admin.

---

## LOW Findings

### L1: Unused `execSync` Import

| File | `server/documentImportService.ts:6` |
|------|--------------------------------------|

`import { execSync } from "child_process"` is imported but not used. Remove to reduce attack surface.

### L2: Suspicious `"add"` devDependency

| File | `package.json:102` |
|------|---------------------|

The npm package `"add"` is a near-empty placeholder, likely installed accidentally.

### L3: `@types/puppeteer` in Production Dependencies

| File | `package.json:50` |
|------|---------------------|

Should be in `devDependencies`.

### L4: Fallback to `http://localhost:3000` in Production

| File | `server/_core/env.ts:16,26` |
|------|------------------------------|

If `PUBLIC_APP_URL`/`APP_URL` are not set, defaults to HTTP localhost.

---

## Positive Findings

- **SQL Injection: SAFE** — All queries use Drizzle ORM with parameterized queries
- **Command Injection: SAFE** — No `exec()`/`spawn()` calls with user input
- **eval(): SAFE** — No `eval()`, `new Function()`, or dynamic code execution
- **Environment Variables: GOOD** — Secrets are externalized via env vars (not hardcoded)
- **.gitignore: GOOD** — `.env` files properly excluded from version control
- **TypeScript strict mode: GOOD** — `strict: true` enabled

---

## Remediation Priority

### Immediate (Before Next Deploy)
1. Replace SHA-256 password hashing with bcrypt (12+ rounds)
2. Fix AES-CBC encryption: random IVs + remove `'default-key'` fallback
3. Replace `Math.random()` with `crypto.randomBytes()` for tokens
4. Sanitize email HTML with DOMPurify in `SentEmailsTab.tsx`
5. Add `escapeHtml()` to all HTML email template interpolations

### Short-Term (Within 1 Week)
6. Add SSRF protection (URL validation, private IP blocking) for all `fetch()` calls
7. Change cookie `sameSite` to `"lax"` and add CSRF protection
8. Add `helmet.js` for security headers
9. Add rate limiting on auth endpoints
10. Reduce JWT expiration to 1 hour + implement refresh tokens

### Medium-Term (Within 1 Month)
11. Audit all `publicProcedure` endpoints for proper authorization
12. Implement proper webhook signature verification (mandatory, not optional)
13. Add URL encoding for Google Drive API `pageToken` parameters
14. Use PBKDF2/scrypt for encryption key derivation
15. Add startup validation for all required security environment variables
