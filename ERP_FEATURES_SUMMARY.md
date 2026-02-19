# AI ERP System - Feature Summary

## Overview

The AI ERP System is a comprehensive, AI-powered Enterprise Resource Planning platform built for CPG (Consumer Packaged Goods) companies, manufacturers, and brands managing complex supply chains with copackers, vendors, and multi-warehouse operations.

**Tech Stack:** React 19 + TypeScript frontend, Express.js + tRPC backend, MySQL with Drizzle ORM (148 tables), Vite build tooling, Vitest testing (25+ test suites).

---

## Core Modules

### 1. AI Assistant & Autonomous Workflows

- **Natural Language Command Bar** (Ctrl+K / Cmd+K) supporting 20+ operation types: create purchase orders, track shipments, record payments, generate invoices, transfer inventory, create work orders, and more -- all from plain English commands.
- **Autonomous Supply Chain Engine** -- demand forecasting, production planning, procurement automation with configurable approval thresholds and exception handling.
- **AI Chat Assistant** with 20+ integrated tools for data analysis, document import, and workflow automation.
- **Approval Queues** for AI-generated actions with configurable thresholds per action type.

### 2. Sales & Order Management

- Full order lifecycle: pending, confirmed, processing, shipped, delivered.
- Customer profiles with credit limits, payment terms, and contact management.
- Order line items, returns, and cancellations.
- Shopify integration for automatic order import and fulfillment sync.

### 3. CRM & Fundraising

- Contact management with types: lead, prospect, customer, partner, investor, donor, vendor.
- Pipeline and deal tracking with custom stages.
- Investor relations with cap table modeling.
- Fundraising campaign management (Pre-Seed through Series C, Bridge rounds).
- Communication history across email, WhatsApp, phone, and meetings.
- Secure data rooms for due diligence document sharing.

### 4. Finance & Accounting

- Full chart of accounts with double-entry bookkeeping (journal entries with debit/credit lines).
- Invoice management (draft, sent, paid, partial, overdue) with recurring invoice support.
- Payment tracking across multiple methods: cash, check, bank transfer, credit card, ACH, wire.
- Account reconciliation and transaction matching.
- Two-way QuickBooks Online sync for customers, vendors, invoices, accounts, and payments.

### 5. Inventory & Warehouse Management

- Multi-warehouse inventory across warehouse types: warehouse, store, distribution center, copacker, 3PL.
- Real-time stock levels with reserved quantities, reorder points, and safety stock.
- Lot and expiration date tracking with FIFO management.
- Full audit trail for all inventory transactions (receipts, shipments, adjustments, transfers, returns, production).
- Inter-warehouse transfers with status tracking (draft, pending, in_transit, received).
- Inventory reservations against orders and production runs.
- AI-driven demand forecasting.

### 6. Manufacturing & BOM

- Multi-level Bills of Materials with component quantities and version history.
- Work order management: draft, scheduled, pending, in_progress, completed.
- Production batch tracking with planned vs. actual quantities.
- Raw material inventory and consumption tracking.
- Production controls: start, pause, complete runs.

### 7. Procurement & Purchase Orders

- Purchase order lifecycle: draft, sent, confirmed, partial, received.
- Vendor management with performance tracking and payment terms.
- Goods receiving against POs with three-way match (PO, receipt, vendor invoice).
- AI-suggested purchase orders based on stock levels and demand forecasts.

### 8. Logistics & Freight

- Inbound/outbound shipment tracking with carrier and tracking number management.
- Freight RFQ management with multi-carrier comparison (price, transit time, service level).
- Freight booking workflow.
- Customs clearance with full document support: commercial invoice, packing list, bill of lading, airway bill, certificate of origin, customs declaration, import/export licenses, insurance, inspection, phytosanitary, fumigation, and dangerous goods certificates.

### 9. Email Inbox & Document Import

- Automatic IMAP email ingestion with AI-powered categorization (receipt, PO, invoice, shipping notice, freight quote, inquiry).
- Auto-reply rules with conditional responses and templates.
- OCR-powered document import: text PDFs via `pdf-parse`, scanned PDFs via vision-based OCR.
- Smart data extraction: vendor, document type, date, amounts, line items with product matching.
- Auto-creation of invoices, POs, or transactions from imported documents with confidence scoring.

### 10. HR & Payroll

- Employee profiles with department, job title, hire date, and status tracking.
- Department hierarchy and organizational structure.
- Compensation tracking with salary history.
- Payroll processing with multiple payment methods.

### 11. Legal & Contracts

- Contract management by type: customer, vendor, employment, NDA, partnership, lease, service.
- Key date tracking with renewal/expiration reminders.
- Status workflow: draft, pending_review, pending_signature, active, expired, terminated, renewed.
- Dispute tracking with priority levels and resolution management.

### 12. Projects & Tasks

- Project management with budget and cost tracking.
- Task assignment with priorities and due dates (todo, in_progress, review, completed).
- Milestone tracking and time tracking per task.

### 13. Data Rooms

- Secure document sharing for investor due diligence and partner onboarding.
- Granular document-level permissions.
- Share links with optional password protection.
- Visitor tracking and access analytics.

### 14. Partner Portals

- **Copacker Portal:** inventory management at copacker facility, shipment tracking, document upload, customs documentation.
- **Vendor Portal:** purchase order management, shipment tracking, customs documentation. Includes a token-based public supplier portal (no login required).

---

## Integrations (98% Complete)

| Integration | Capabilities |
|---|---|
| **QuickBooks Online** | OAuth 2.0, two-way sync (customers, vendors, invoices, accounts, payments) |
| **Shopify** | Order import, customer sync, inventory sync, fulfillment updates, webhooks |
| **Google Workspace** | Gmail (send/draft/read), Sheets (read/write/append), Docs (create/edit/share), Drive (sync/sharing) |
| **SendGrid** | Transactional email, templates, delivery tracking via webhooks |
| **Fireflies.ai** | Meeting transcription, action item extraction, task creation |
| **IMAP Email** | Inbound email scanning from any mailbox |
| **Stripe** | Payment processing |
| **Slack** | Notification delivery |
| **HubSpot** | CRM data sync |
| **Airtable** | Data sync |
| **Webhooks** | Custom webhook support for third-party systems |

---

## Role-Based Access Control

| Role | Access Level |
|---|---|
| **admin** | Full access to all modules and settings |
| **finance** | Accounts, invoices, payments, transactions, read-only customers/vendors |
| **ops** | Products, inventory, orders, purchase orders, shipments, warehouses, vendors, transfers |
| **legal** | Contracts, disputes, documents, read-only customers/vendors/employees |
| **exec** | Dashboard, reports, AI, read-only access across modules |
| **copacker** | Inventory at own warehouse, shipments with document upload |
| **vendor** | Own POs, shipments, invoices (read-only) |
| **contractor** | Assigned projects, own documents |
| **user** | Dashboard (read), AI assistant (query) |

Admins can override permissions on a per-user basis through a granular permission system.

---

## Database

148 tables organized across: core entities, finance, sales & orders, inventory, procurement, manufacturing, logistics & freight, HR & legal, projects, CRM & fundraising, email & communication, integrations, AI & automation, and operational/data management.

---

## Scale

- **78+ page components** across all modules
- **69+ UI components** (Radix UI / Shadcn based)
- **65+ tRPC routers** handling API operations
- **25+ test suites** covering AI, auth, email, workflows, freight, invoicing, forecasting, and more
- **40+ documentation files** covering features, setup guides, and operational procedures
