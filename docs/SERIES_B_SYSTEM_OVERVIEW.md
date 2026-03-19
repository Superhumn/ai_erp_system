# AI ERP System -- Technology & Product Overview

**Prepared for Series B Due Diligence**
**Confidential -- March 2026**

---

## Executive Summary

The AI ERP System is a vertically integrated, AI-native enterprise resource planning platform purpose-built for CPG (Consumer Packaged Goods) companies, manufacturers, and brands managing complex supply chains with copackers, vendors, and multi-warehouse operations.

Unlike legacy ERP systems that bolt on AI as an afterthought, our platform was designed from inception around autonomous AI agents that actively manage supply chain operations, procurement, production planning, and financial workflows -- with configurable human-in-the-loop oversight for high-value decisions.

The system consolidates 10+ point solutions (inventory management, order management, accounting, CRM, procurement, manufacturing, logistics, HR, legal, and document management) into a single, modern platform, dramatically reducing software spend and integration complexity for mid-market CPG brands.

---

## Product Scope & Modules

### Core Operational Modules

| Module | Key Capabilities |
|---|---|
| **Sales & Order Management** | Sales orders, customer management, status tracking (pending through delivered), Shopify sync, returns |
| **Operations & Inventory** | Multi-warehouse stock tracking, lot/expiration management, real-time levels, reservations, physical counts, inter-warehouse transfers |
| **Manufacturing & BOM** | Multi-level bill of materials with versioning, work orders, production batches, raw material tracking, yield analysis |
| **Procurement** | Purchase order lifecycle, vendor management, goods receiving, three-way match (PO/receipt/invoice), AI-suggested reorders |
| **Logistics & Freight** | Shipment tracking, freight RFQ management, carrier comparison, booking, customs clearance with 12+ document types |
| **Finance & Accounting** | Chart of accounts, double-entry journal entries, invoicing (including recurring), payments, account reconciliation, QuickBooks two-way sync |
| **CRM & Fundraising** | Contact pipeline management, investor tracking, campaign management for funding rounds, cap table modeling, communication logging |
| **HR & Payroll** | Employee profiles, department hierarchy, compensation tracking, payroll processing |
| **Legal & Contracts** | Contract lifecycle management (7 types), renewal/expiration tracking, dispute management, document storage |
| **Projects & Tasks** | Project management with budgets, task assignment, milestone tracking, time tracking |

### AI & Automation Layer

| Capability | Description |
|---|---|
| **AI Command Bar** | Natural language interface (Cmd+K) for all operations -- create POs, record payments, generate invoices, transfer inventory, and more via plain English |
| **Conversational AI Assistant** | 20+ integrated tools for data analysis, email generation, document parsing (including OCR), forecasting, and anomaly detection |
| **Autonomous Supply Chain Orchestrator** | 14 automated workflows running on schedule/event/threshold triggers covering demand forecasting, production planning, procurement, fulfillment, and payment processing |
| **AI Agent Scheduler** | Rule-based automation engine for inventory reorders, PO generation, vendor follow-ups, payment reminders, quality checks |
| **Smart Document Import** | Vision-based OCR for scanned PDFs with automatic entity extraction, confidence scoring, and record creation |
| **Email Intelligence** | IMAP-based inbox scanning with AI categorization, auto-reply rules, and automatic task creation |

### Partner Portals

| Portal | Access Model | Capabilities |
|---|---|---|
| **Copacker Portal** | Authenticated | Inventory reporting, shipment management, customs document upload |
| **Vendor Portal** | Authenticated | PO management, shipment tracking, document upload |
| **Public Supplier Portal** | Token-based (no login) | Export document upload, freight configuration, HS codes, incoterms |
| **Investor Data Rooms** | Share-link with optional password | Secure document sharing, visitor tracking, access logging |

### Integrations

| Integration | Scope |
|---|---|
| **QuickBooks Online** | OAuth 2.0, two-way sync of customers, vendors, invoices, chart of accounts, payments |
| **Shopify** | Order import, customer sync, inventory sync, fulfillment updates |
| **Google Workspace** | Gmail, Sheets, Docs, Drive (full CRUD and sync) |
| **SendGrid** | Transactional email, template management, delivery tracking via webhooks |
| **Fireflies.ai** | Meeting transcription, action item extraction, automatic task creation |
| **IMAP** | Inbound email scanning from any mailbox |
| **Airtable** | Data import from Airtable bases |

---

## Technology Architecture

### Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Radix UI, Wouter routing |
| **Backend** | Express.js, tRPC (end-to-end type-safe RPC), Node.js |
| **Database** | MySQL with Drizzle ORM |
| **Build** | Vite 7 (frontend), esbuild (backend), TypeScript 5.9 |
| **Testing** | Vitest with 31 test suites |
| **Auth** | OAuth 2.0 (Google, Apple, Microsoft, GitHub) + email/password with PBKDF2 hashing, JWT sessions |
| **AI/ML** | LLM-powered agents, vision-based OCR, autonomous workflow engine |
| **Infra** | Deployable to Vercel, Railway, or any Node.js host; S3-compatible storage |

### Architecture Highlights

- **End-to-End Type Safety**: tRPC provides compile-time type checking from database schema through API layer to React components -- eliminating an entire class of runtime errors
- **Monorepo with Shared Types**: Single repository with `client/`, `server/`, and `shared/` directories; shared Zod schemas validate data at every boundary
- **169 Database Tables**: Comprehensive relational schema (5,076 lines) covering all business domains with full referential integrity
- **90 Page Components, 69 UI Components**: Rich, production-grade frontend built on Radix UI primitives with consistent design system
- **128,000+ Lines of TypeScript**: Fully typed codebase with zero JavaScript files
- **Autonomous Agent Architecture**: Three auto-starting background services (Supply Chain Orchestrator, AI Agent Scheduler, Email Queue Worker) that operate independently with configurable human oversight

### Security & Access Control

- **10 Role Types**: admin, finance, procurement, ops, plant, legal, exec, copacker, vendor, contractor -- each with granular module-level permissions
- **Granular Permission Overrides**: Admins can customize access per user beyond role defaults
- **Secure Authentication**: PBKDF2 with 100,000 iterations, JWT in HTTP-only cookies, rate limiting
- **Audit Trail**: All autonomous AI decisions are logged with full traceability
- **Data Room Security**: Password-protected share links with visitor tracking and access logging

---

## Autonomous AI Capabilities -- Competitive Differentiator

The autonomous workflow engine is the core differentiator of this platform. Rather than requiring manual intervention for routine operations, the system runs 14 automated workflows:

### Workflow Schedule

| Workflow | Trigger | Approval Threshold |
|---|---|---|
| Daily Demand Forecasting | 6 AM daily | None (advisory) |
| Production Planning | 7 AM daily | None (advisory) |
| Material Requirements Planning | 8 AM daily | > $1,000 |
| Procurement Processing | Event-driven | Configurable |
| Inventory Reorder Check | Threshold-based | > $500 |
| Inventory Optimization | 2 AM Sundays | None |
| Work Order Generation | Event-driven | None |
| Production Scheduling | 5 AM daily | None |
| Order Fulfillment | Event-driven | None |
| Shipment Tracking | Every 2 hours | None |
| Supplier Performance Review | Monthly | None |
| Invoice Matching | Event-driven | None |
| Payment Processing | 10 AM Mon/Wed/Fri | > $2,000 |
| Exception Handling | Threshold-based | Varies |

### Multi-Level Approval Hierarchy

The system enforces configurable approval thresholds to maintain financial controls:

**Purchase Orders:**
- Auto-approve: up to $1,000
- Level 1 (Ops Manager): $1,001 -- $5,000
- Level 2 (Admin): $5,001 -- $25,000
- Level 3 (Executive): $25,000+

**Payments:**
- Auto-approve: up to $2,000
- Level 1 (Ops): $2,001 -- $10,000
- Level 2 (Admin): $10,001 -- $50,000
- Level 3 (Executive): $50,000+

### AI Decision Making

The AI agents make decisions across:
- **Vendor selection** based on historical performance scoring
- **Reorder quantity calculation** using demand forecasts and safety stock models
- **Production scheduling** optimized for capacity and material availability
- **Freight carrier selection** balancing cost vs. transit time
- **Quote evaluation** with automatic accept/reject recommendations
- **Anomaly detection** with automatic exception routing

---

## Deployment & Infrastructure

### Deployment Options

| Platform | Method |
|---|---|
| **Vercel** | One-click deploy, automatic CI/CD from GitHub |
| **Railway** | Managed Node.js hosting with auto-detection |
| **Self-hosted** | Any Node.js 18+ environment; single `dist/index.js` bundle serves both API and static frontend |

### Production Build

The build produces two artifacts:
1. `dist/public/` -- Static frontend assets (served by Express)
2. `dist/index.js` -- Bundled backend server

This single-binary deployment model simplifies infrastructure and reduces operational overhead.

### Database

- MySQL with Drizzle ORM for type-safe queries and migrations
- 169 tables with full relational integrity
- Migration management via `drizzle-kit`

---

## Key Metrics

| Metric | Value |
|---|---|
| Total codebase | 128,000+ lines of TypeScript |
| Database tables | 169 |
| Schema definition | 5,076 lines |
| Frontend pages | 90 |
| UI components | 69 |
| Backend services | 23+ |
| Test suites | 31 |
| Integrations | 7 (QuickBooks, Shopify, Google Workspace, SendGrid, Fireflies, IMAP, Airtable) |
| Autonomous workflows | 14 |
| AI assistant tools | 20+ |
| User role types | 10 |
| Supported auth methods | 5 (email/password, Google, Apple, Microsoft, GitHub) |

---

## Competitive Positioning

### vs. Legacy ERP (NetSuite, SAP Business One)

| Dimension | Legacy ERP | AI ERP System |
|---|---|---|
| **AI Integration** | Bolt-on, limited | Native, autonomous agents |
| **Implementation** | 6-18 months, $100K+ | Self-serve, deploy in minutes |
| **Customization** | Consultant-dependent | Code-level flexibility |
| **Supply Chain Automation** | Manual workflows | 14 autonomous workflows with human-in-the-loop |
| **Natural Language Interface** | None | Full NLP command bar and conversational AI |
| **Partner Portals** | Separate add-ons | Built-in copacker, vendor, and supplier portals |
| **Document Intelligence** | Basic OCR add-ons | Vision-based OCR with automatic record creation |
| **Cost** | $50K-500K+/year | Fraction of legacy pricing |

### vs. Modern ERPs (Cin7, Katana, Fishbowl)

| Dimension | Modern Point Solutions | AI ERP System |
|---|---|---|
| **Scope** | 1-3 modules, requires integrations | All-in-one: 10+ modules |
| **AI Capabilities** | Basic reporting | Autonomous agents, NLP, OCR, forecasting |
| **CPG-Specific** | Generic | Purpose-built for CPG with copacker management |
| **Fundraising/CRM** | Not included | Built-in investor CRM, cap tables, data rooms |
| **Integration Complexity** | Multiple tools to connect | Single platform, native integrations |

---

## Target Market

**Primary ICP:** CPG brands and manufacturers with $2M--$50M in revenue managing:
- Multi-warehouse inventory operations
- Copacker and contract manufacturer relationships
- Complex vendor/supplier networks
- Production planning and BOM management
- Omnichannel sales (DTC + wholesale + marketplace)

**Secondary ICP:** Growth-stage consumer brands actively fundraising, who benefit from the integrated CRM, cap table, and data room features alongside operational ERP.

---

## Product Roadmap Highlights

Building on the current platform, planned enhancements include:
- Advanced demand forecasting with external data signals (weather, seasonality, promotions)
- EDI (Electronic Data Interchange) for enterprise retail compliance
- Multi-currency and multi-entity support for international operations
- Mobile-native companion app for warehouse and production floor
- Expanded marketplace integrations (Amazon, Walmart, Target+)
- Enhanced AI agent capabilities with reinforcement learning from approval feedback

---

*This document is confidential and intended solely for prospective investors conducting due diligence in connection with a Series B financing. Distribution or reproduction without written consent is prohibited.*
