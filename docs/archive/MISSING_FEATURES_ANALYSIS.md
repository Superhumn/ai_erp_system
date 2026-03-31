# AI ERP System - Missing Features & Gap Analysis

> **Generated:** 2026-03-02
> **Purpose:** Identify everything needed to make the system fully functional

---

## Executive Summary

The AI ERP system is a large, ambitious application with ~367 files, 140+ database tables, 25 test suites, and a full React + Express + tRPC + MySQL stack. Many core modules are built with UI and backend logic. However, there are significant gaps across **environment/infrastructure**, **incomplete features**, **missing integrations**, and **untested code paths** that prevent the system from being production-ready.

---

## 1. CRITICAL: Environment & Infrastructure Requirements

These items must be configured before the system can run at all.

### 1.1 Database (Required)
- [ ] **MySQL database instance** - Provision a MySQL database (local, AWS RDS, PlanetScale, Railway, etc.)
- [ ] Set `DATABASE_URL` in `.env` (e.g., `mysql://user:pass@host:3306/ai_erp_system`)
- [ ] Run `pnpm run db:push` to create all 140+ tables via Drizzle migrations

### 1.2 Authentication (Required)
- [ ] Set `JWT_SECRET` in `.env` (minimum 32 characters, cryptographically random)
- [ ] Configure at least one OAuth provider for user login:
  - [ ] `OAUTH_SERVER_URL` - External OAuth server
  - [ ] OR Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

### 1.3 File Storage (Required for document features)
- [ ] **S3-compatible storage** - Configure AWS S3 or compatible service (Cloudflare R2, MinIO, etc.)
- [ ] The system uses `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` but **no S3 environment variables are documented in `.env.example`**
- [ ] Add and configure: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION` (or equivalent)

### 1.4 LLM/AI Provider (Required for AI features)
- [ ] The system uses `invokeLLM()` from `server/_core/llm.ts` but **no AI API key is documented in `.env.example`**
- [ ] Configure the AI provider credentials (likely needs `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY`, or an OpenAI/Anthropic key)
- [ ] Without this, the AI Assistant, AI Command Bar, autonomous workflows, document parsing, email categorization, and forecasting will all fail

---

## 2. IMPORTANT: Third-Party Integrations (Optional but key for full functionality)

### 2.1 Email - SendGrid (for outbound email)
- [ ] Create SendGrid account and obtain API key
- [ ] Set `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` in `.env`
- [ ] Verify sender domain/email in SendGrid dashboard
- [ ] Configure SendGrid webhook URL for delivery tracking: `https://yourdomain.com/webhooks/sendgrid/events`
- [ ] Set `SENDGRID_WEBHOOK_SECRET` for webhook signature verification
- **Without this:** No invoice emails, PO notifications, freight RFQ emails, auto-replies, or AI-drafted emails will send

### 2.2 Email - IMAP (for inbound email scanning)
- [ ] Set `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD` in `.env`
- **Without this:** Email inbox scanning, auto-categorization, and auto-reply features won't function

### 2.3 QuickBooks Online
- [ ] Create QuickBooks developer app at developer.intuit.com
- [ ] Set `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_REDIRECT_URI`
- [ ] Set `QUICKBOOKS_ENVIRONMENT` to `sandbox` or `production`
- [ ] The TODO in `todo.md` still marks "QuickBooks Online sync integration" as incomplete
- **Without this:** No two-way sync of customers, vendors, invoices, or chart of accounts with QuickBooks

### 2.4 Shopify
- [ ] Create Shopify app at partners.shopify.com
- [ ] Set `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_REDIRECT_URI`
- [ ] Register webhook endpoints in Shopify admin:
  - `https://yourdomain.com/webhooks/shopify/orders`
  - `https://yourdomain.com/webhooks/shopify/inventory`
- [ ] **Missing:** Shopify settings page for store configuration (UI pending per todo.md)
- **Without this:** No order import, customer sync, or inventory sync with Shopify

### 2.5 Google Workspace
- [ ] Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- [ ] Set `GOOGLE_SHEETS_API_KEY` for Sheets import
- [ ] Enable Google APIs: Drive, Sheets, Docs, Gmail
- **Without this:** No Google Drive sync, Sheets import, Gmail integration, or Docs creation

### 2.6 Stripe (Referenced but not implemented)
- [ ] Stripe is listed as an integration in the README but no Stripe environment variables or implementation code exists
- [ ] Needs: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- [ ] Needs: Payment processing endpoints, webhook handlers

### 2.7 Slack (Referenced but not implemented)
- [ ] Slack is listed as an integration in the README but no implementation exists
- [ ] Needs: Slack app creation, bot token, webhook URL
- [ ] Needs: Notification delivery to Slack channels

### 2.8 HubSpot (Referenced but not implemented)
- [ ] HubSpot CRM sync is referenced but no dedicated integration exists
- [ ] Needs: HubSpot API key, sync logic for contacts/deals

### 2.9 Airtable (Referenced but not implemented)
- [ ] Airtable data sync is listed in README but no implementation exists

---

## 3. INCOMPLETE FEATURES (Code exists but partially implemented)

### 3.1 AI Autonomous Workflows
The autonomous workflow engine exists (`server/autonomousWorkflowEngine.ts`, `server/supplyChainOrchestrator.ts`) but several TODO items remain:
- [ ] **AI-driven email automation for vendor communications** - Marked incomplete in todo.md
- [ ] **Anomaly detection alerts** - Listed as incomplete
- [ ] **Material shortage alerts** when inventory < requirements
- [ ] The `autonomousWorkflowEngine.ts:881` has `// TODO: Actually send email if configured`

### 3.2 Email System Gaps
- [ ] **Link parsed documents to existing POs and shipments** - Incomplete
- [ ] **Document review and approval workflow** for imported emails
- [ ] **Manual email forwarding endpoint** for processing
- [ ] **Unit tests for email parsing functionality** - Missing
- [ ] **Auto-route emails to appropriate workflows** based on category
- [ ] **Automatic email inbox monitoring** for freight quote response collection
- [ ] Team invitation emails: `routers.ts:9976` has `// TODO: Send invitation email`
- [ ] Team invitation resend: `routers.ts:10008` has `// TODO: Resend invitation email`
- [ ] DB notification emails: `db.ts:4793` has `// TODO: Send email notification via SendGrid`

### 3.3 Inventory & Operations
- [ ] **Inventory reservation for pending work orders** - Incomplete
- [ ] **Reconciliation report UI** - Backend exists, UI pending
- [ ] **Copacker role restrictions** (location-only view, no cost visibility) - Not fully enforced in UI

### 3.4 RBAC (Role-Based Access Control)
- [ ] **Plant User role** (Work Orders/Receiving/Inventory/Transfers only) - Not implemented
- [ ] **Split Finance/Procurement permissions** - Not implemented
- [ ] Copacker UI restrictions not fully enforced (cost visibility)

### 3.5 AI Command Bar
- [ ] **Vendor suggestion** - Backend procedure to get preferred vendor based on PO history not built
- [ ] Show suggested vendor in task preview before submission
- [ ] Add direct "New" button to Inventory tab
- [ ] Add direct "New" button to Locations tab

### 3.6 Bulk Operations (Partially Done)
Some bulk operations were marked as done in a later section, but the original checklist items remain unchecked:
- [ ] Bulk export to CSV action
- [ ] Bulk email action for selected vendors/customers
- [ ] Bulk import support for multiple documents (document import)

---

## 4. MISSING FEATURES (Not built at all)

### 4.1 Stripe Payment Processing
- [ ] Payment intent creation
- [ ] Checkout sessions
- [ ] Webhook handler for payment events (succeeded, failed, refunded)
- [ ] Link Stripe payments to invoices
- [ ] Customer payment method management

### 4.2 Slack Notification Integration
- [ ] Slack bot/app setup
- [ ] Channel notification delivery for key events (new orders, low stock, approvals needed)
- [ ] Slash commands for quick ERP queries

### 4.3 HubSpot CRM Sync
- [ ] Contact sync (bidirectional)
- [ ] Deal/pipeline sync
- [ ] Activity/engagement logging

### 4.4 Airtable Data Sync
- [ ] Base connection
- [ ] Table mapping
- [ ] Bidirectional sync logic

### 4.5 Webhooks System (Generic)
- [ ] Custom webhook configuration UI
- [ ] Outbound webhook delivery for entity events
- [ ] Webhook retry logic and failure handling
- [ ] Webhook secret/signature verification

### 4.6 Reporting & Analytics Dashboard
- [ ] Financial reports (P&L, Balance Sheet, Cash Flow Statement)
- [ ] Sales reports with date range filtering and export
- [ ] Inventory valuation report
- [ ] Vendor performance scorecards
- [ ] Custom report builder

### 4.7 Multi-Tenant / Multi-Company Support
- [ ] The `companies` table exists but multi-company isolation may not be fully enforced
- [ ] Company-scoped data queries (ensuring users only see their company's data)
- [ ] Company switching UI

### 4.8 Mobile Responsiveness
- [ ] The system uses `useMobile()` hook but full mobile optimization may be incomplete
- [ ] Touch-friendly interactions for spreadsheet views
- [ ] Mobile navigation (hamburger menu / bottom nav)

---

## 5. TESTING GAPS

### 5.1 Missing Test Coverage
- [ ] **Email parsing unit tests** - Explicitly marked missing in todo.md
- [ ] **Frontend component tests** - No React component tests exist
- [ ] **Integration tests** - No end-to-end tests
- [ ] **API endpoint tests** - Only some routers have test coverage
- [ ] Several tests may be skipped or mocked; verify all 25 test suites actually pass

### 5.2 Run & Verify Tests
```bash
pnpm run test
```

---

## 6. DEPLOYMENT & PRODUCTION READINESS

### 6.1 Security Hardening
- [ ] **Rate limiting** - No rate limiting middleware on API endpoints
- [ ] **CORS configuration** - Verify CORS policy is properly set for production domain
- [ ] **Helmet.js** - No security headers middleware (missing from dependencies)
- [ ] **Input sanitization** - Verify all user inputs are sanitized beyond Zod validation
- [ ] **SQL injection** - Drizzle ORM handles this, but verify raw queries
- [ ] **XSS protection** - Verify React's built-in protection is sufficient, no `dangerouslySetInnerHTML` misuse
- [ ] **CSRF protection** - Verify token-based auth is sufficient
- [ ] **Encryption at rest** - Verify sensitive data (API keys, tokens) is encrypted in the database (crypto.ts exists but verify coverage)
- [ ] **Secret rotation** - Plan for rotating JWT_SECRET, API keys, etc.

### 6.2 Performance & Scalability
- [ ] **Database indexing** - Verify indexes on frequently queried columns (foreign keys, status fields, dates)
- [ ] **Connection pooling** - Verify MySQL connection pool configuration
- [ ] **Caching** - No Redis or caching layer exists; may be needed for dashboard KPIs, search, etc.
- [ ] **Background job queue** - Email queue worker exists but no robust job queue (Bull, BullMQ, etc.)
- [ ] **CDN for static assets** - Configure CDN for production frontend assets

### 6.3 Monitoring & Observability
- [ ] **Application logging** - Currently uses `console.log`; consider structured logging (Winston, Pino)
- [ ] **Error tracking** - No Sentry, Datadog, or similar error tracking service
- [ ] **Health check endpoint** - Add `/health` endpoint for load balancer/uptime monitoring
- [ ] **Metrics** - No Prometheus/metrics collection
- [ ] **Uptime monitoring** - External service to monitor availability

### 6.4 CI/CD Pipeline
- [ ] **Build pipeline** - Only branch deletion workflow exists in `.github/workflows/`
- [ ] Add CI workflow: lint, type-check, test on PRs
- [ ] Add CD workflow: auto-deploy to staging/production on merge
- [ ] **Environment management** - Staging vs production environment separation

### 6.5 Backup & Recovery
- [ ] **Database backups** - Automated MySQL backup schedule
- [ ] **S3 backup** - Backup strategy for uploaded documents
- [ ] **Disaster recovery plan** - RTO/RPO targets and restore procedures

---

## 7. PRIORITY ACTION PLAN

### Phase 1: Make it Run (Day 1)
1. Provision MySQL database and set `DATABASE_URL`
2. Run `pnpm install && pnpm run db:push`
3. Set `JWT_SECRET` (32+ char random string)
4. Configure OAuth provider for login
5. Configure LLM API credentials
6. Run `pnpm run dev` and verify the app starts

### Phase 2: Core Functionality (Week 1)
1. Configure S3 storage for file uploads
2. Configure SendGrid for outbound email
3. Configure IMAP for inbound email
4. Run `pnpm run test` and fix any failing tests
5. Implement missing TODO items in code (5 TODOs in production code)

### Phase 3: Integration Completion (Week 2-3)
1. Complete QuickBooks integration
2. Complete Shopify integration + settings UI
3. Set up Google Workspace APIs
4. Build Stripe payment processing
5. Build Slack notification integration

### Phase 4: Production Hardening (Week 3-4)
1. Add rate limiting, security headers, CORS
2. Set up error tracking (Sentry)
3. Add structured logging
4. Add health check endpoint
5. Set up CI/CD pipeline
6. Configure database backups
7. Add monitoring/alerting

### Phase 5: Feature Completion (Ongoing)
1. Complete AI autonomous workflow gaps
2. Build reconciliation report UI
3. Build Shopify settings UI
4. Implement remaining RBAC roles
5. Add frontend tests
6. Complete bulk operations (CSV export, bulk email)
7. Build HubSpot, Airtable, generic webhook integrations
8. Financial reporting suite

---

## 8. ENVIRONMENT VARIABLE CHECKLIST

Complete `.env` file needed for full functionality:

```env
# === REQUIRED ===
DATABASE_URL=mysql://user:pass@host:3306/ai_erp_system
JWT_SECRET=<32+ char random string>
NODE_ENV=production
PORT=3000
APP_URL=https://yourdomain.com
VITE_APP_URL=https://yourdomain.com

# === AUTHENTICATION (at least one required) ===
OAUTH_SERVER_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/google/callback

# === FILE STORAGE (required for documents) ===
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_REGION=

# === AI/LLM (required for AI features) ===
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=

# === EMAIL - OUTBOUND (required for email features) ===
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_WEBHOOK_SECRET=

# === EMAIL - INBOUND (required for inbox scanning) ===
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=
IMAP_PASSWORD=

# === QUICKBOOKS (for accounting sync) ===
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_REDIRECT_URI=https://yourdomain.com/api/oauth/quickbooks/callback
QUICKBOOKS_ENVIRONMENT=production

# === SHOPIFY (for e-commerce sync) ===
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
SHOPIFY_REDIRECT_URI=https://yourdomain.com/api/shopify/callback

# === GOOGLE WORKSPACE (for Drive/Sheets/Docs/Gmail) ===
GOOGLE_SHEETS_API_KEY=

# === AIRTABLE (for data import) ===
AIRTABLE_PERSONAL_ACCESS_TOKEN=
```

---

## Summary (Updated after fixes)

| Category | Done | Missing | % Complete |
|---|---|---|---|
| Database Schema | 140+ tables | 0 | ~100% |
| Backend API Routes | ~65 routers | TODO stubs fixed | ~98% |
| Frontend Pages | ~50 pages + Shopify Settings + Reconciliation | Remaining minor gaps | ~95% |
| Integrations (built) | 7 (QB, Shopify, Google, SendGrid, IMAP, Fireflies, Airtable) | None blocked | ~95% |
| Test Suites | 25 files | Frontend tests, integration tests | ~70% |
| AI Features | Core built | Email automation, anomaly detection | ~85% |
| Security/Production | Health check, rate limiting, security headers, CI/CD | Monitoring, backups | ~65% |
| **Overall Estimate** | | | **~87%** |

The system has a strong foundation. The remaining blockers to "fully functional" are:
1. **Environment configuration** (database, auth, AI provider, storage)
2. **Monitoring and error tracking** (Sentry/Datadog)
3. **AI workflow completion** (anomaly detection, email automation)
4. **Frontend and integration tests**
