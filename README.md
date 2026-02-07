# AI ERP System

A modern, AI-powered Enterprise Resource Planning system built for CPG (Consumer Packaged Goods) companies, manufacturers, and brands managing complex supply chains with copackers, vendors, and multi-warehouse operations. Built with React, Express, tRPC, and MySQL.

---

## Table of Contents

- [System Overview](#system-overview)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Feature Guide](#feature-guide)
  - [Dashboard & Home](#dashboard--home)
  - [AI Assistant & Autonomous Workflows](#ai-assistant--autonomous-workflows)
  - [Sales & Order Management](#sales--order-management)
  - [CRM & Fundraising](#crm--fundraising)
  - [Finance & Accounting](#finance--accounting)
  - [Operations & Inventory](#operations--inventory)
  - [Manufacturing & BOM](#manufacturing--bom)
  - [Procurement & Purchase Orders](#procurement--purchase-orders)
  - [Logistics & Freight](#logistics--freight)
  - [Email Inbox & Document Import](#email-inbox--document-import)
  - [HR & Payroll](#hr--payroll)
  - [Legal & Contracts](#legal--contracts)
  - [Projects & Tasks](#projects--tasks)
  - [Data Rooms](#data-rooms)
  - [Copacker Portal](#copacker-portal)
  - [Vendor Portal](#vendor-portal)
  - [Integrations](#integrations)
  - [Settings & Team Management](#settings--team-management)
- [User Roles & Permissions](#user-roles--permissions)
- [Standard Operating Procedures (SOPs)](#standard-operating-procedures-sops)
  - [SOP 1 - Getting Started (All Users)](#sop-1---getting-started-all-users)
  - [SOP 2 - Daily Operations (Internal Team)](#sop-2---daily-operations-internal-team)
  - [SOP 3 - Order-to-Cash Workflow](#sop-3---order-to-cash-workflow)
  - [SOP 4 - Procure-to-Pay Workflow](#sop-4---procure-to-pay-workflow)
  - [SOP 5 - Inventory Management](#sop-5---inventory-management)
  - [SOP 6 - Manufacturing & Production](#sop-6---manufacturing--production)
  - [SOP 7 - Copacker Standard Operating Procedure](#sop-7---copacker-standard-operating-procedure)
  - [SOP 8 - Vendor / Supplier Standard Operating Procedure](#sop-8---vendor--supplier-standard-operating-procedure)
  - [SOP 9 - Email & Document Processing](#sop-9---email--document-processing)
  - [SOP 10 - Freight & Logistics](#sop-10---freight--logistics)
  - [SOP 11 - Finance & Invoicing](#sop-11---finance--invoicing)
  - [SOP 12 - CRM & Fundraising](#sop-12---crm--fundraising)
  - [SOP 13 - AI Autonomous Workflows](#sop-13---ai-autonomous-workflows)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Integration Setup Guides](#integration-setup-guides)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [License](#license)

---

## System Overview

The AI ERP System is an all-in-one platform for managing every aspect of a product-based business:

- **Sales** -- Orders, customers, invoicing, and Shopify sync
- **Operations** -- Inventory across multiple warehouses, procurement, manufacturing, and logistics
- **Finance** -- Chart of accounts, journal entries, invoices, payments, and QuickBooks sync
- **Supply Chain Automation** -- AI-driven demand forecasting, automated PO generation, and workflow orchestration with human-in-the-loop approvals
- **CRM & Fundraising** -- Investor management, campaign tracking, cap tables, and data rooms
- **HR & Legal** -- Employee management, payroll, contracts, and dispute tracking
- **Partner Portals** -- Dedicated portals for copackers and vendors with role-restricted access
- **Email & Document Intelligence** -- Inbound email scanning, OCR-powered document import, and auto-categorization
- **Integrations** -- QuickBooks, Shopify, Google Workspace, SendGrid, Fireflies.ai, and more

---

## Architecture & Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS, Radix UI, Wouter routing |
| Backend | Express.js, tRPC (type-safe RPC), Node.js |
| Database | MySQL with Drizzle ORM (140+ tables) |
| Build | Vite (frontend), esbuild (backend), TypeScript |
| Testing | Vitest (21+ test suites) |
| Auth | OAuth 2.0 (Google, Apple, Microsoft, GitHub), JWT sessions |
| AI/ML | LLM-powered assistant, vision-based OCR, autonomous workflow engine |
| Package Manager | pnpm |

---

## Feature Guide

### Dashboard & Home

**URL:** `/`

The home dashboard provides an at-a-glance overview of the business:

- **KPI Cards** -- Revenue this month, invoices paid, pending invoices, open disputes, customer count, vendor count, product count, active employees, and active projects. Each card links to its respective module.
- **Finance Overview** -- Pending invoices, open POs, and active contracts.
- **Operations Summary** -- Total products, active vendors, and pending purchase orders.
- **Quick Actions** -- Shortcuts to create an invoice, create a new PO, or ask the AI assistant.

### AI Assistant & Autonomous Workflows

**URLs:** `/ai`, `/ai/approvals`, `/autonomous-dashboard`, `/approvals`, `/exceptions`

**AI Assistant** -- A conversational AI assistant with 20+ integrated tools:
- Analyze sales, inventory, vendor, customer, and financial data
- Generate and send emails
- Import and parse documents (including scanned PDFs via OCR)
- Create purchase orders and adjust inventory
- Track shipments and communicate with vendors/customers
- Detect trends, anomalies, and generate forecasts

**Autonomous Supply Chain Workflows** -- Multi-step business process automation:
- **Demand Forecasting** -- AI-driven predictions based on historical data
- **Production Planning** -- Automated scheduling and resource allocation
- **Procurement Automation** -- Auto-generated PO suggestions when stock hits reorder points
- **Freight Optimization** -- RFQ generation and carrier selection
- **Exception Handling** -- Automatic escalation and alerts for anomalies
- **Approval Queue** -- Multi-level approval with configurable thresholds for high-value decisions
- **Workflow Monitoring** -- Real-time dashboards with execution metrics

### Sales & Order Management

**URLs:** `/sales/hub`, `/sales/orders`, `/sales/orders/:id`, `/sales/customers`, `/sales/customers/:id`

- Create and manage sales orders with full status tracking: `pending` → `confirmed` → `processing` → `shipped` → `delivered`
- Spreadsheet-style order management with inline editing
- Customer profiles with contact details, payment terms, and credit limits
- Order line items with product, quantity, and pricing
- Returns and cancellation management
- Sync orders from Shopify automatically

### CRM & Fundraising

**URLs:** `/crm`, `/crm/hub`, `/crm/contacts`, `/crm/messaging`, `/crm/investors`, `/crm/campaigns`

**CRM Hub:**
- Contact management with types: lead, prospect, customer, partner, investor, donor, vendor
- Source tracking: iPhone bump, WhatsApp, LinkedIn scan, business card, website, referral, event, and more
- Pipeline stages: `new` → `contacted` → `qualified` → `proposal` → `negotiation` → `won`/`lost`
- Messaging and engagement tracking

**Fundraising Module:**
- Investor profiles and relationship tracking
- Campaign management for funding rounds (Pre-Seed, Seed, Series A/B/C, Bridge)
- Investment commitments and cap table modeling
- Communication history (email, WhatsApp, phone, meetings)
- Follow-up reminders and task tracking
- Data room access management for due diligence

### Finance & Accounting

**URLs:** `/finance/accounts`, `/finance/invoices`, `/finance/payments`, `/finance/transactions`

- **Chart of Accounts** -- Full account structure (assets, liabilities, equity, revenue, expenses)
- **Journal Entries** -- Double-entry bookkeeping with debit/credit lines
- **Invoices** -- Create, send, and track invoices with status workflow: `draft` → `sent` → `paid`/`partial`/`overdue`
- **Recurring Invoices** -- Template-based automated invoice generation
- **Payments** -- Track payments received and made; multiple methods (cash, check, bank transfer, credit card, ACH, wire)
- **Account Reconciliation** -- Match transactions and reconcile accounts
- **QuickBooks Sync** -- Two-way sync of customers, vendors, invoices, and chart of accounts

### Operations & Inventory

**URLs:** `/operations`, `/operations/inventory-hub`, `/operations/inventory-management`, `/operations/products`, `/operations/locations`, `/operations/transfers`

- **Multi-Warehouse Inventory** -- Track stock across warehouse types: warehouse, store, distribution center, copacker facility, and 3PL
- **Real-Time Stock Levels** -- Current quantity, reserved quantity, reorder points, and safety stock
- **Lot & Expiration Tracking** -- Lot numbers and expiration dates for perishable goods
- **Inventory Transactions** -- Full audit trail of all movements (receipts, shipments, adjustments, transfers, returns, production consumption/output)
- **Inventory Transfers** -- Move stock between warehouses with status tracking: `draft` → `pending` → `in_transit` → `received`
- **Inventory Reservations** -- Reserve stock against orders and production runs
- **Product Catalog** -- SKU management with status tracking (active, inactive, discontinued)
- **Physical Count** -- Record and reconcile physical inventory counts

### Manufacturing & BOM

**URLs:** `/operations/manufacturing-hub`, `/operations/work-orders`, `/operations/bom`, `/operations/raw-materials`

- **Bill of Materials (BOM)** -- Define multi-level BOMs with component quantities and versions
- **Work Orders** -- Manufacturing work orders with status tracking: `draft` → `scheduled` → `pending` → `in_progress` → `completed`
- **Production Batches** -- Batch tracking with planned vs. actual quantities
- **Raw Materials** -- Track raw material inventory and consumption
- **Production Controls** -- Start, pause, and complete production runs from the manufacturing dashboard

### Procurement & Purchase Orders

**URLs:** `/operations/procurement-hub`, `/operations/purchase-orders`, `/operations/receiving`, `/operations/vendors`

- **Purchase Order Management** -- Create, send, and track POs: `draft` → `sent` → `confirmed` → `partial` → `received`
- **Vendor Management** -- Supplier profiles, contact info, payment terms, and performance tracking
- **Receiving** -- Record goods receipt against POs
- **Three-Way Match** -- Match PO, receipt, and vendor invoice for payment approval
- **AI-Suggested POs** -- Automated reorder suggestions based on stock levels and demand forecasts

### Logistics & Freight

**URLs:** `/operations/logistics-hub`, `/operations/shipments`

- **Shipment Tracking** -- Inbound and outbound shipments with carrier info and tracking numbers
- **Freight RFQ Management** -- Create requests for quotes from multiple carriers
- **Carrier Comparison** -- Compare quotes by price, transit time, and service level
- **Freight Bookings** -- Book shipments with selected carriers
- **Customs Clearance** -- International shipment customs management
- **Customs Documents** -- Upload and manage: commercial invoice, packing list, bill of lading, airway bill, certificate of origin, customs declaration, import/export licenses, insurance, inspection, phytosanitary, fumigation, and dangerous goods certificates

### Email Inbox & Document Import

**URLs:** `/operations/email-inbox`, `/operations/document-import`

**Email Inbox Scanner:**
- Automatic inbound email ingestion via IMAP
- AI-powered categorization: receipt, PO, invoice, shipping notice, freight quote, general inquiry
- Auto-reply rules with conditions and templates
- Attachment processing and storage
- Task creation from emails

**Document Import with OCR:**
- Upload PDFs (text-based or scanned) for automatic data extraction
- Smart detection: text PDFs use `pdf-parse`; scanned PDFs fall back to vision-based OCR
- Extracted data: vendor name, document type, date, amounts, line items, and product matching
- Automatically creates invoices, purchase orders, or transactions from parsed documents
- Confidence scoring on extracted data

### HR & Payroll

**URLs:** `/hr/employees`, `/hr/payroll`

- Employee profiles with department, job title, hire date, and status
- Department hierarchy and organizational structure
- Compensation history tracking
- Payroll processing with multiple payment methods
- Employment lifecycle management (hire, termination, status changes)

### Legal & Contracts

**URLs:** `/legal/contracts`, `/legal/disputes`, `/legal/documents`

- **Contract Management** -- Track contracts by type: customer, vendor, employment, NDA, partnership, lease, service
- **Key Date Tracking** -- Renewal dates, expiration dates, and custom milestones with reminders
- **Status Workflow** -- `draft` → `pending_review` → `pending_signature` → `active` → `expired`/`terminated`/`renewed`
- **Dispute Tracking** -- Log disputes with priority levels, resolution tracking, and linked documents
- **Document Storage** -- Centralized legal document management

### Projects & Tasks

**URL:** `/projects`

- Project creation with budget, cost tracking, and progress monitoring
- Task management with assignment, priority, due dates, and status workflow: `todo` → `in_progress` → `review` → `completed`
- Milestone tracking
- Time tracking per task

### Data Rooms

**URLs:** `/datarooms`, `/dataroom/:id`, `/share/:code`

- Create secure data rooms for document sharing (investor due diligence, partner onboarding)
- Upload documents with granular permission control
- Generate share links with optional password/code protection
- Visitor tracking and access logging
- Public access via `/share/:code` (no authentication required)

### Copacker Portal

**URL:** `/portal/copacker`

A dedicated portal for copacker partners (restricted to `copacker`, `admin`, or `ops` roles):

- **Inventory Tab** -- View and update stock levels at their facility, with notes and last-updated timestamps
- **Shipments Tab** -- Track inbound/outbound shipments, view carrier info, and upload shipping documents (BOL, packing lists)
- **Customs Tab** -- View customs clearances and upload all required customs documents

### Vendor Portal

**URLs:** `/portal/vendor`, `/supplier-portal/:token` (public token-based access)

A dedicated portal for vendor/supplier partners (restricted to `vendor`, `admin`, or `ops` roles):

- **Purchase Orders Tab** -- View assigned POs, update status (`confirmed` → `partial` → `received`), and upload documents
- **Shipments Tab** -- Track linked shipments and upload shipping documents
- **Customs Tab** -- Upload customs documentation

**Public Supplier Portal** (no login required, token-based):
- Upload export documents: commercial invoice, packing list, dimensions/weight, HS codes, certificate of origin, MSDS/SDS, bill of lading, customs declaration
- Configure freight details: package dimensions, weight, volume, preferred shipping, dangerous goods info, incoterms

### Integrations

**URL:** `/settings/integrations`

| Integration | Capabilities |
|---|---|
| **QuickBooks Online** | OAuth 2.0 auth, two-way sync of customers, vendors, invoices, chart of accounts, payments |
| **Shopify** | Order import, customer sync, inventory sync, fulfillment updates |
| **Google Workspace** | Gmail (send/draft/read), Sheets (read/write/append), Docs (create/edit/share), Drive (folder sync/file sharing) |
| **SendGrid** | Transactional email, template management, delivery tracking via webhooks |
| **Fireflies.ai** | Meeting transcription, action item extraction, automatic task creation |
| **IMAP Email** | Inbound email scanning from any mailbox |
| **Stripe** | Payment processing |
| **Slack** | Notification delivery |
| **HubSpot** | CRM data sync |
| **Airtable** | Data sync |
| **Webhooks** | Custom webhook support for third-party systems |

### Settings & Team Management

**URLs:** `/settings`, `/settings/team`, `/settings/integrations`, `/settings/fireflies`, `/import`

- **Team Management** -- Invite users, assign roles, manage permissions
- **Integration Configuration** -- Connect and configure third-party services
- **Data Import** -- Bulk import from Google Sheets or CSV
- **Notification Preferences** -- Configure alert channels and frequency
- **Application Settings** -- Branding, general preferences

---

## User Roles & Permissions

| Role | Access Level |
|---|---|
| **admin** | Full access to all modules and settings |
| **finance** | Accounts, invoices, payments, transactions, read-only access to customers/vendors |
| **ops** | Products, inventory, orders, purchase orders, shipments, warehouses, vendors, transfers |
| **legal** | Contracts, disputes, documents, read-only access to customers/vendors/employees |
| **exec** | Dashboard, reports, AI, read-only access across modules |
| **copacker** | Inventory (read/update at own warehouse), shipments (read + upload documents) |
| **vendor** | Own POs (read + update status), own shipments (read + upload), own invoices (read) |
| **contractor** | Assigned projects (read/update), own documents (read/upload) |
| **user** | Dashboard (read), AI assistant (query) |

Admins can override permissions on a per-user basis through the granular permission system.

---

## Standard Operating Procedures (SOPs)

### SOP 1 - Getting Started (All Users)

**Purpose:** First-time login and orientation.

1. **Receive your invitation** -- An admin will send you a team invitation with your assigned role.
2. **Sign in** -- Navigate to the application URL and sign in using your preferred method (Email, Google, Apple, Microsoft, or GitHub).
3. **Review the Dashboard** -- After login you land on the home dashboard. Review the KPI cards for a snapshot of the business.
4. **Explore the Sidebar** -- The left sidebar contains all navigation grouped by department: Overview, Sales & Finance, CRM, Operations, People & Legal, Projects & Data, and Settings.
5. **Try the AI Assistant** -- Press `Ctrl+K` (or `Cmd+K` on Mac) to open the AI Command Bar, or navigate to `/ai`. Ask questions about sales, inventory, or any data in the system.
6. **Check Notifications** -- Click the notification bell to see pending approvals, alerts, and updates.

### SOP 2 - Daily Operations (Internal Team)

**Purpose:** Daily routine for operations, finance, and sales team members.

**Morning Check:**
1. Open the **Dashboard** (`/`) and review KPIs for any anomalies.
2. Check the **Approval Queue** (`/ai/approvals`) for pending workflow approvals.
3. Review the **Email Inbox** (`/operations/email-inbox`) for new inbound emails that need attention.
4. Check **Notifications** for alerts on low stock, overdue invoices, or expiring contracts.

**Throughout the Day:**
5. Process new **Sales Orders** in the Sales Hub (`/sales/hub`).
6. Review and approve **Purchase Orders** (`/operations/purchase-orders`).
7. Monitor **Shipments** (`/operations/shipments`) for delivery updates.
8. Process **Invoices** and record **Payments** (`/finance/invoices`, `/finance/payments`).

**End of Day:**
9. Review the **Autonomous Dashboard** (`/autonomous-dashboard`) for any exceptions or failed workflows.
10. Address any items in the **Exception Log** (`/exceptions`).

### SOP 3 - Order-to-Cash Workflow

**Purpose:** Complete lifecycle from receiving a customer order to collecting payment.

```
Customer Order → Inventory Check → Fulfillment → Shipment → Invoice → Payment
```

1. **Receive Order**
   - Orders arrive via Shopify sync or manual creation at `/sales/hub`.
   - New orders start in `pending` status.

2. **Confirm & Process**
   - Review the order and confirm availability in the Inventory Hub (`/operations/inventory-hub`).
   - Move the order to `confirmed`, then `processing`.
   - The system automatically reserves inventory against the order.

3. **Pick, Pack & Ship**
   - Create a shipment record at `/operations/shipments`.
   - Enter carrier, tracking number, and expected delivery date.
   - Upload the bill of lading or packing list.
   - Update order status to `shipped`.

4. **Generate Invoice**
   - Navigate to `/finance/invoices` and create an invoice linked to the order.
   - The invoice starts as `draft`. Review line items, then move to `sent`.
   - Optionally send via email using SendGrid integration.

5. **Collect Payment**
   - When payment is received, record it at `/finance/payments`.
   - Select payment method (check, wire, ACH, credit card, etc.).
   - The invoice updates to `paid` (or `partial` if partially paid).

6. **Reconcile**
   - Match the payment against the invoice in `/finance/transactions`.
   - The order automatically updates to `delivered` upon shipment confirmation.

### SOP 4 - Procure-to-Pay Workflow

**Purpose:** Complete lifecycle from identifying a purchasing need to paying the vendor.

```
Reorder Trigger → PO Creation → Vendor Confirmation → Receiving → Invoice Match → Payment
```

1. **Identify Need**
   - The AI system flags items below reorder point, or operations staff identifies a need.
   - Check the Procurement Hub (`/operations/procurement-hub`) for AI-suggested POs.

2. **Create Purchase Order**
   - Create a PO at `/operations/purchase-orders` with vendor, items, quantities, and expected delivery.
   - PO starts as `draft`. Review and move to `sent`.

3. **Vendor Confirms**
   - The vendor confirms via their portal (`/portal/vendor`) or by email.
   - PO status moves to `confirmed`.

4. **Receive Goods**
   - When goods arrive, go to `/operations/receiving`.
   - Record quantities received against the PO.
   - PO status moves to `partial` (if partial shipment) or `received` (if complete).
   - Inventory automatically updates with received quantities.

5. **Three-Way Match**
   - Match the PO, goods receipt, and vendor invoice.
   - Import the vendor invoice via document import (`/operations/document-import`) or create manually.

6. **Pay Vendor**
   - Approve the matched invoice for payment.
   - Record payment at `/finance/payments`.
   - Optionally sync to QuickBooks.

### SOP 5 - Inventory Management

**Purpose:** Maintaining accurate inventory across all locations.

1. **Monitor Stock Levels**
   - Use the Inventory Hub (`/operations/inventory-hub`) to view stock by product and warehouse.
   - Set reorder points and safety stock levels per product per location.
   - The system alerts when stock falls below reorder point.

2. **Process Inventory Adjustments**
   - For damaged, expired, or miscounted stock, create an inventory adjustment.
   - Select the reason (damage, expiration, count correction, etc.) and enter the quantity change.
   - All adjustments are logged in the audit trail.

3. **Transfer Between Warehouses**
   - Navigate to `/operations/transfers` and create a new transfer.
   - Select source warehouse, destination warehouse, and items/quantities.
   - Transfer workflow: `draft` → `pending` → `in_transit` → `received`.
   - Source inventory is deducted when transfer moves to `in_transit`.
   - Destination inventory is credited when transfer is marked `received`.

4. **Physical Inventory Count**
   - Schedule a physical count for a warehouse.
   - Enter counted quantities per product.
   - The system calculates variances and generates adjustment transactions.

5. **Lot & Expiration Management**
   - Assign lot numbers and expiration dates during receiving.
   - The system tracks FIFO (first-in, first-out) by expiration date.
   - Alerts are generated for items approaching expiration.

### SOP 6 - Manufacturing & Production

**Purpose:** Managing production from BOM to finished goods.

1. **Define Bill of Materials**
   - Navigate to `/operations/bom` and create a BOM for each finished product.
   - Add raw material components with quantities per unit.
   - BOMs support versioning for formula changes.

2. **Create Work Order**
   - Go to `/operations/work-orders` and create a work order referencing the product and BOM.
   - Specify the planned quantity and target completion date.
   - Work order starts as `draft`.

3. **Schedule Production**
   - Move the work order to `scheduled`.
   - Verify raw material availability in the Raw Materials section (`/operations/raw-materials`).
   - If materials are short, create a purchase order for the missing items.

4. **Start Production**
   - From the Manufacturing Hub (`/operations/manufacturing-hub`), click **Start** on the work order.
   - Status moves to `in_progress`.
   - Raw materials are consumed (deducted from inventory).

5. **Complete Production**
   - When the batch is finished, click **Complete**.
   - Enter actual output quantity (may differ from planned).
   - Finished goods are added to inventory.
   - Status moves to `completed`.

6. **Track Production Batches**
   - Each production run creates a batch record for traceability.
   - Track batch number, production date, and yield percentage.

### SOP 7 - Copacker Standard Operating Procedure

**Purpose:** Guide for copacker partners using the Copacker Portal.

**Access:** Sign in with your copacker credentials and navigate to `/portal/copacker`.

**A. Inventory Reporting**
1. Open the **Inventory** tab in the Copacker Portal.
2. You will see all products stored at your facility.
3. Click on any product row to edit the quantity.
4. Update the current stock level and add a note (e.g., "Counted 2/5, adjusted for damaged units").
5. Click **Save**. The brand owner sees the updated quantity in real time.
6. **Frequency:** Update inventory at least once per week, or after every production run and shipment.

**B. Shipment Management**
1. Open the **Shipments** tab.
2. View all inbound (raw materials arriving) and outbound (finished goods shipping out) shipments.
3. For each shipment, review the carrier, tracking number, and status.
4. **Upload Documents:** Click the upload button to attach:
   - Bill of Lading (BOL)
   - Packing lists
   - Delivery receipts
   - Any other shipping documentation
5. **Frequency:** Upload documents within 24 hours of shipment dispatch or receipt.

**C. Customs Documentation (International Shipments)**
1. Open the **Customs** tab.
2. View customs clearances associated with your shipments.
3. Upload required documents:
   - Commercial Invoice
   - Packing List
   - Bill of Lading / Airway Bill
   - Certificate of Origin
   - Customs Declaration
   - Import/Export Licenses
   - Insurance Certificate
   - Inspection Certificates
   - Phytosanitary / Fumigation Certificates (if applicable)
   - Dangerous Goods Declaration (if applicable)
4. **Frequency:** Upload all documents before or at the time of shipment.

**D. Communication**
- If you have questions or issues, use the messaging features or contact the ops team directly.
- The brand owner can monitor your inventory and shipment updates through the main system.

### SOP 8 - Vendor / Supplier Standard Operating Procedure

**Purpose:** Guide for vendor/supplier partners using the Vendor Portal.

**Access Option 1 (Registered Vendors):** Sign in with your vendor credentials and navigate to `/portal/vendor`.

**Access Option 2 (Public Supplier Portal):** Use the token-based link provided by the buyer (format: `/supplier-portal/:token`). No login is required.

**A. Purchase Order Management (Registered Vendors)**
1. Open the **Purchase Orders** tab in the Vendor Portal.
2. View all POs assigned to you with details: PO number, order date, expected date, items, and total amount.
3. **Confirm a PO:** Click to update the status from `sent` to `confirmed` to acknowledge the order.
4. **Ship Partial or Full:** Update status to `partial` (if shipping in multiple deliveries) or `received` (when the buyer confirms full receipt).
5. **Upload Documents:** Attach invoices, shipping confirmations, or other documents to each PO.

**B. Shipment Tracking (Registered Vendors)**
1. Open the **Shipments** tab.
2. View shipments linked to your POs.
3. Upload shipping documents (BOL, packing lists, delivery confirmations).
4. Track status updates from the buyer.

**C. Customs Documentation (Registered Vendors)**
1. Open the **Customs** tab.
2. Upload all export-side customs documents (same list as copacker customs documents above).

**D. Public Supplier Portal (Token Access)**
1. Open the link provided by the buyer.
2. **Upload Export Documents:**
   - Commercial Invoice
   - Packing List
   - Dimensions & Weight details
   - HS Codes
   - Certificate of Origin
   - MSDS/SDS (Material Safety Data Sheet)
   - Bill of Lading
   - Customs Declaration
3. **Configure Freight Information:**
   - Package dimensions (length, width, height) and weight
   - Volume specifications
   - Preferred shipping method
   - Dangerous goods information (if applicable)
   - Incoterms selection (FOB, CIF, EXW, etc.)
4. Submit. The buyer receives all uploaded documents and freight data in their system automatically.

### SOP 9 - Email & Document Processing

**Purpose:** Processing inbound emails and importing documents with OCR.

**A. Email Inbox**
1. Navigate to `/operations/email-inbox`.
2. The system automatically scans the configured IMAP mailbox and pulls in new emails.
3. Each email is auto-categorized: receipt, PO, invoice, shipping notice, freight quote, or general.
4. Review categorized emails and take action:
   - **Invoices/Receipts:** Click to import and create a transaction or invoice record.
   - **POs:** Review and link to existing purchase orders.
   - **Shipping Notices:** Update shipment records with tracking info.
5. Configure **Auto-Reply Rules** to automatically respond to common email types.

**B. Document Import (OCR)**
1. Navigate to `/operations/document-import`.
2. Upload a PDF document (invoice, PO, receipt, or other business document).
3. The system detects whether the PDF is text-based or scanned:
   - **Text PDFs** are parsed directly for data extraction.
   - **Scanned PDFs** are processed through vision-based OCR.
4. Review the extracted data: vendor name, document type, date, total amount, and line items.
5. The system attempts to match vendors and products to existing records.
6. Confirm the extracted data and the system automatically creates the corresponding record (invoice, PO, or transaction).
7. Review the confidence score -- low-confidence extractions should be manually verified.

### SOP 10 - Freight & Logistics

**Purpose:** Managing freight quotes, bookings, and international shipments.

1. **Create Freight RFQ**
   - Navigate to the Logistics Hub (`/operations/logistics-hub`).
   - Create a Request for Quote specifying origin, destination, cargo details, and required dates.

2. **Receive & Compare Quotes**
   - Carriers respond with quotes (price, transit time, service level).
   - Compare quotes side-by-side in the freight dashboard.

3. **Book Shipment**
   - Select the winning quote and create a booking.
   - The system generates the shipment record with carrier details.

4. **Track Shipment**
   - Monitor shipment status from `pending` → `in_transit` → `delivered`.
   - View tracking updates and carrier notifications.

5. **Customs Clearance (International)**
   - For international shipments, create a customs clearance record.
   - Upload all required customs documents (see SOP 7, Section C for full list).
   - Track customs status through clearance.

### SOP 11 - Finance & Invoicing

**Purpose:** Day-to-day financial operations.

**A. Creating Invoices**
1. Navigate to `/finance/invoices` and click **New Invoice**.
2. Select the customer, add line items (product, quantity, price), and set payment terms.
3. Save as `draft`, review, then move to `sent`.
4. Optionally email the invoice to the customer via SendGrid.

**B. Recording Payments**
1. When a payment is received, go to `/finance/payments`.
2. Select the invoice being paid, enter the amount and payment method.
3. If partial payment, the invoice moves to `partial`. If full payment, it moves to `paid`.

**C. Journal Entries**
1. Navigate to `/finance/transactions` to create manual journal entries.
2. Add debit and credit lines ensuring the entry balances.
3. Post the entry. It appears in the general ledger immediately.

**D. Recurring Invoices**
1. Set up recurring invoice templates for subscription or regular billing.
2. Configure frequency, start date, and template.
3. The system auto-generates invoices on schedule.

**E. QuickBooks Sync**
1. Connect QuickBooks from `/settings/integrations`.
2. Sync customers, vendors, invoices, and chart of accounts.
3. Changes in either system can be synced bi-directionally.

### SOP 12 - CRM & Fundraising

**Purpose:** Managing investor relationships and fundraising campaigns.

1. **Add Investors** at `/crm/investors` with contact details, investment history, and notes.
2. **Create Campaigns** at `/crm/campaigns` for each fundraising round (Pre-Seed, Seed, Series A, etc.).
3. **Track Communications** -- Log every interaction (email, WhatsApp, phone call, meeting) with each investor.
4. **Manage Investments** -- Record commitments, amounts, and terms per investor per campaign.
5. **Cap Table** -- View and manage ownership snapshots over time.
6. **Data Rooms** -- Create secure data rooms at `/datarooms` for investor due diligence. Upload documents, set permissions, and share via link.
7. **Follow-Up Reminders** -- Set reminders for follow-up calls, emails, or meetings.

### SOP 13 - AI Autonomous Workflows

**Purpose:** Leveraging AI automation for supply chain and business operations.

1. **Review the Autonomous Dashboard** (`/autonomous-dashboard`).
   - View active workflows, recent runs, and performance metrics.

2. **Workflow Types:**
   - **Demand Forecast** -- AI analyzes historical sales and predicts future demand.
   - **Auto-Reorder** -- When stock hits reorder point, AI drafts a PO for approval.
   - **Production Planning** -- AI suggests production schedules based on demand and inventory.
   - **Freight Optimization** -- AI selects optimal carrier based on cost and transit time.

3. **Approval Process:**
   - Workflows that exceed configured thresholds (e.g., PO value > $5,000) are routed to the Approval Queue (`/ai/approvals`).
   - Reviewers can approve, reject, or modify the AI's recommendation.
   - Below-threshold actions execute automatically.

4. **Exception Handling:**
   - When a workflow encounters an error or anomaly, it logs an exception at `/exceptions`.
   - Review exceptions daily and take corrective action.
   - Configure exception rules to define automatic escalation paths.

5. **Monitoring:**
   - Track AI decision confidence scores.
   - Review autonomous decision logs for audit compliance.
   - Adjust thresholds and rules as business needs evolve.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + K` | Open AI Command Bar |
| `G` then `D` | Go to Dashboard |
| `G` then `A` | Go to AI Assistant |
| `G` then `S` | Go to Sales Hub |
| `G` then `C` | Go to CRM Hub |
| `G` then `M` | Go to Manufacturing Hub |
| `G` then `P` | Go to Procurement Hub |
| `G` then `L` | Go to Logistics Hub |
| `G` then `E` | Go to Email Inbox |
| `?` | Show keyboard shortcuts help |

---

## Setup & Installation

### Prerequisites

- Node.js 18+ (recommended: latest LTS)
- pnpm 10.4.1+
- MySQL database

### 1. Install Dependencies

```bash
npm install -g pnpm
pnpm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your configuration (see [Environment Variables](#environment-variables) below).

### 3. Database Setup

```bash
pnpm run db:push
```

This generates and runs all database migrations (140+ tables).

### 4. Start Development Server

```bash
pnpm run dev
```

The application starts at `http://localhost:3000`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | MySQL connection string (e.g., `mysql://user:pass@localhost:3306/ai_erp_system`) |
| `JWT_SECRET` | Yes | Secure secret key, minimum 32 characters |
| `NODE_ENV` | No | `development` or `production` (default: `development`) |
| `PORT` | No | Server port (default: `3000`) |
| `APP_URL` | No | Application URL (default: `http://localhost:3000`) |
| `VITE_APP_TITLE` | No | Application title shown in the UI |
| `OAUTH_SERVER_URL` | No | External OAuth server URL |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | No | Google OAuth redirect URI |
| `GOOGLE_SHEETS_API_KEY` | No | Google Sheets API key for import |
| `IMAP_HOST` | No | IMAP server for email scanning |
| `IMAP_PORT` | No | IMAP port (default: `993`) |
| `IMAP_USER` | No | IMAP username |
| `IMAP_PASSWORD` | No | IMAP password |
| `SENDGRID_API_KEY` | No | SendGrid API key for transactional email |
| `SENDGRID_FROM_EMAIL` | No | Default sender email address |
| `QUICKBOOKS_CLIENT_ID` | No | QuickBooks OAuth client ID |
| `QUICKBOOKS_CLIENT_SECRET` | No | QuickBooks OAuth client secret |
| `QUICKBOOKS_REDIRECT_URI` | No | QuickBooks OAuth redirect URI |
| `QUICKBOOKS_ENVIRONMENT` | No | `sandbox` or `production` |

---

## Integration Setup Guides

Detailed setup documentation for each integration:

- **QuickBooks** -- See [QUICKBOOKS_SETUP.md](./QUICKBOOKS_SETUP.md)
- **Shopify** -- See [SHOPIFY_SETUP.md](./SHOPIFY_SETUP.md)
- **SendGrid** -- See [docs/SENDGRID_SETUP.md](./docs/SENDGRID_SETUP.md)
- **Google Drive** -- See [docs/GOOGLE_DRIVE_SYNC.md](./docs/GOOGLE_DRIVE_SYNC.md)

---

## Deployment

### Railway (Recommended)

1. **Build Command:** `pnpm run build`
2. **Start Command:** `pnpm run start`
3. Set all required environment variables in the Railway dashboard.
4. Railway auto-detects configuration from `package.json`.

### Production Build (Manual)

```bash
pnpm run build
```

This produces:
- `dist/public/` -- Static frontend assets (served by Express)
- `dist/index.js` -- Bundled backend server

```bash
PORT=8080 pnpm run start
```

---

## Project Structure

```
ai_erp_system/
├── client/                 # React frontend application
│   └── src/
│       ├── components/     # 69+ reusable UI components (Radix UI + custom)
│       ├── pages/          # Page components organized by module
│       │   ├── sales/      # Sales Hub, Orders, Customers
│       │   ├── operations/ # Inventory, Procurement, Manufacturing, Logistics
│       │   ├── finance/    # Accounts, Invoices, Payments, Transactions
│       │   ├── crm/        # CRM Hub, Investors, Campaigns
│       │   ├── hr/         # Employees, Payroll
│       │   ├── legal/      # Contracts, Disputes, Documents
│       │   ├── portal/     # Copacker & Vendor portals
│       │   ├── ai/         # AI Assistant & Approvals
│       │   └── settings/   # Team, Integrations, Import
│       ├── hooks/          # Custom React hooks
│       ├── lib/            # Utilities and tRPC client setup
│       └── App.tsx         # Main router
├── server/                 # Express backend with tRPC
│   ├── _core/             # Core server setup (auth, context, tRPC, routes)
│   ├── routers/           # 65+ tRPC routers (one per module)
│   ├── services/          # Business logic (AI agent, email, OCR, workflows)
│   └── db.ts              # Database queries and helper functions
├── shared/                 # Shared types, constants, and schemas
├── drizzle/               # Database schema and migrations
│   └── schema.ts          # 140+ table definitions
├── docs/                  # Additional documentation
├── scripts/               # Utility and setup scripts
├── .env.example           # Environment variable template
├── package.json           # Dependencies and scripts
├── vite.config.ts         # Frontend build configuration
├── tsconfig.json          # TypeScript configuration
└── drizzle.config.ts      # Drizzle ORM configuration
```

---

## Available Scripts

| Command | Description |
|---|---|
| `pnpm run dev` | Start development server with hot reload |
| `pnpm run build` | Build frontend (Vite) and backend (esbuild) for production |
| `pnpm run start` | Start production server |
| `pnpm run check` | TypeScript type checking |
| `pnpm run format` | Format code with Prettier |
| `pnpm run test` | Run test suites with Vitest |
| `pnpm run db:push` | Generate and run database migrations |

---

## License

MIT
