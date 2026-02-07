# AI-Native ERP System - TODO

## Core Infrastructure
- [x] Complete database schema with all entities
- [x] Role-based access control (admin, finance, ops, legal, exec)
- [x] Audit trail system for financial and legal records
- [x] Dashboard layout with sidebar navigation

## Finance Module
- [x] Accounts management (chart of accounts)
- [x] Invoice creation and tracking
- [x] Payment tracking and reconciliation
- [x] Cash flow monitoring
- [ ] QuickBooks Online sync integration
- [x] Financial reports and analytics

## Sales & Revenue Module
- [x] Customer management
- [x] Order tracking
- [x] Revenue analytics and reporting
- [ ] Shopify sync integration
- [x] Sales pipeline visualization

## Operations Module
- [x] Inventory management
- [x] Production batch tracking
- [x] Supplier management
- [x] Purchase order workflow
- [x] Logistics and shipping tracking

## HR & Contractors Module
- [x] People records management
- [x] Role and department tracking
- [x] Compensation management
- [x] Contractor agreements
- [x] Payment management

## Legal & Compliance Module
- [x] Contract lifecycle management
- [x] Dispute tracking
- [x] Key dates and reminders
- [x] Document storage (S3 integration)
- [x] Compliance tracking

## Projects Module
- [x] Initiative tracking
- [x] Owner assignment
- [x] Timeline management
- [x] Budget tracking
- [x] Status updates and reporting

## Executive Dashboard
- [x] Real-time KPI widgets
- [x] Cross-module metrics aggregation
- [x] Customizable dashboard layout
- [x] Trend visualization
- [x] Alert notifications

## AI Capabilities
- [x] Natural language query interface
- [x] Context-aware data responses
- [x] Data visualization from queries
- [x] AI summaries of financials and ops
- [ ] Anomaly detection alerts

## Integrations
- [ ] QuickBooks Online API setup
- [ ] Shopify API setup
- [ ] Webhook handlers for external systems

## Unit Tests
- [x] Dashboard metrics tests
- [x] Finance module tests
- [x] Sales module tests
- [x] Operations module tests
- [x] HR module tests
- [x] Projects module tests
- [x] Authentication tests

## Google Sheets Import Feature
- [x] Google Sheets API backend integration
- [x] Import UI page with sheet URL input
- [x] Sheet preview and column mapping interface
- [x] Data import logic for Customers module
- [x] Data import logic for Vendors module
- [x] Data import logic for Products module
- [x] Data import logic for Invoices module
- [x] Data import logic for Employees module
- [x] Data import logic for Contracts module
- [x] Data import logic for Projects module
- [x] Unit tests for import functionality (8 tests passing)

## Google Drive OAuth Integration
- [x] Google OAuth 2.0 authentication flow
- [x] Store and refresh Google access tokens
- [x] List Google Drive spreadsheets
- [x] Access private sheets via Drive API
- [x] Update import UI for OAuth flow

## AI Freight Quote Management System
- [x] Database schema for freight RFQs, quotes, and carriers
- [x] Database schema for customs clearance and documentation
- [x] AI email system for requesting quotes from freight forwarders
- [x] Quote compilation and comparison interface
- [x] Shipment document management (BOL, commercial invoice, packing list)
- [x] Customs clearance workflow and tracking
- [x] AI-powered quote analysis and recommendations
- [x] Carrier/forwarder database management
- [x] Integration with existing shipments module
- [x] Email templates for freight communications
- [x] Freight dashboard with active RFQs and clearances
- [x] Unit tests for freight management (28 tests passing)

## RFQ Workflow Fixes
- [x] Fix RFQ detail page navigation from RFQ list
- [x] Add manual quote entry form with full cost breakdown
- [x] Enable sending RFQ to carriers (AI-generated emails)
- [x] Quote comparison view with accept/reject actions
- [x] Create booking when quote is accepted
- [x] Update RFQ status through workflow stages
- [x] Add email parsing for incoming quote responses
- [x] AI quote analysis and scoring

## Navigation Consolidation
- [x] Remove separate Carriers menu item from Freight
- [x] Add carrier/forwarder tab to Vendors page
- [x] Simplify Freight menu to just RFQs and Customs
- [x] Freight carriers now managed in Vendors & Carriers page

## Navigation Styling Fixes
- [x] Fix overlapping text in navigation menu
- [x] Reduce excessive spacing between menu items

## Multi-Location Inventory Management
- [x] Add locations/facilities table to database (copacker, warehouse, 3PL types)
- [x] Update inventory to track stock by location
- [x] Add inventory transfers between locations
- [x] Location management UI (add/edit facilities)
- [x] Inventory view with location filter
- [x] Transfer request workflow (draft → pending → in_transit → received)
- [x] Consolidated inventory dashboard across all locations

## Shopify & HubSpot Customer Sync
- [x] Add Shopify and HubSpot ID fields to customers table
- [x] Add sync status and last synced timestamp fields
- [x] Build Shopify API integration for customer import
- [x] Build HubSpot API integration for customer import
- [x] Create sync UI with tabbed dialog for Shopify/HubSpot
- [x] Add manual sync trigger button on Customers page
- [x] Display Shopify/HubSpot source badges on customer records
- [x] Handle duplicate detection and merging
- [x] Sync status cards showing customer sources
- [x] Source filter on customers list

## Team Member Access Control
- [x] Extend user roles to include copacker, vendor, contractor, and team member types
- [x] Add team invitations table for granular access control
- [x] Create team member invitation system with invite codes
- [x] Build team management UI page with role assignment
- [x] Implement permission-based route guards (copackerProcedure, vendorProcedure)
- [x] Create copacker-restricted inventory update view (Copacker Portal)
- [x] Create copacker-restricted shipment document upload view
- [x] Add vendor portal with limited PO and shipment access
- [x] Link users to specific warehouses or vendors

## Bill of Materials (BOM) Module

- [x] BOM database schema (parent product, components, quantities)
- [x] BOM versions and revision tracking
- [x] Component cost rollup calculations
- [x] BOM list and detail UI pages
- [x] Add/edit BOM components interface
- [x] Import existing BOM data from Google Sheets (13 raw materials created)
- [x] BOM cost analysis view
- [x] Raw materials management page
- [x] Production requirements calculation

## Integrated Production Workflow
- [x] Work orders schema (link to BOM, production quantity, status)
- [x] Link POs to raw materials (PO line items reference raw material IDs)
- [x] PO receiving workflow (mark items received, update raw material inventory)
- [x] Shipment tracking linked to PO receiving
- [x] Raw material inventory ledger (track quantities by location)
- [x] Work order creation from BOM (auto-calculate material requirements)
- [x] Material consumption on work order completion
- [ ] Inventory reservation for pending work orders
- [x] Production dashboard showing active work orders (Work Orders page)
- [ ] Material shortage alerts when inventory < requirements
- [x] Work Orders UI page with list and detail views
- [x] PO Receiving UI page with receiving workflow
- [x] Unit tests for production workflow (21 tests passing)

## AI Production Forecasting & Auto-PO Generation
- [x] Database schema for demand forecasts and forecast history
- [x] AI forecasting engine using LLM to analyze sales trends and predict demand
- [x] Production requirements calculation based on forecasts and BOMs
- [x] Raw material requirements aggregation from production forecasts
- [x] Inventory gap analysis (required vs available raw materials)
- [x] Auto-generate draft purchase orders for material shortages
- [x] One-click approval for generated POs
- [x] Forecasting dashboard with demand predictions and charts
- [x] Suggested PO list with approve/reject actions
- [x] Forecast accuracy tracking over time (schema ready)
- [x] Unit tests for forecasting functionality (23 tests passing)

## Vendor Lead Times for PO Generation
- [x] Add lead time fields to vendor schema (default lead time in days)
- [x] Add lead time field to raw materials (material-specific lead time)
- [x] Update material requirements to calculate required order date based on lead times
- [x] Update suggested PO generation to use lead times for order date recommendations
- [x] Display lead time and estimated delivery date in suggested PO UI
- [x] Add urgency indicators when lead time exceeds available time
- [x] Unit tests for lead time calculations (13 new tests, 148 total passing)

## Foodservice Wholesale Pricelist Import
- [x] Access Google Sheet with foodservice pricelist
- [x] Extract product data (SKU, name, price, etc.)
- [x] Match existing products by SKU
- [x] Update existing products with new data (override)
- [x] Create new products for new SKUs (8 products created)
- [x] Verify import results

## Freight Quotes Workflow Fix
- [x] Fix freight quotes button navigation/action (WORKS - opens carrier selection dialog)
- [x] Send RFQ emails to freight vendors when requested (AI generates personalized emails)
- [x] Monitor and collect quote responses from vendors (Add Quote from Email dialog with AI parsing)
- [x] Display quote comparison with all received quotes (quotes table with AI scoring)
- [x] Enable selection of best quote option (accept/reject buttons on each quote)
- [x] Create booking when quote is accepted (accept procedure creates booking)
- [x] Connect to actual SMTP/email service for real email delivery (SendGrid integrated)
- [ ] Add automatic email inbox monitoring for response collection

## SendGrid Email Integration
- [x] Request SendGrid API key from user (user will add later via Settings → Secrets)
- [x] Create SendGrid email service helper (server/_core/email.ts)
- [x] Update freight RFQ sendToCarriers to use SendGrid
- [x] Update email status from 'draft' to 'sent' after successful delivery
- [x] Add error handling for failed email delivery
- [x] Configure sender email address (from address via SENDGRID_FROM_EMAIL)
- [x] Write unit tests for email sending (12 tests, 160 total passing)

## Specification Gap Completion

### Lot/Batch Tracking System
- [x] Create InventoryLot table (lot_code, product_id, expiry, attributes JSON)
- [x] Create InventoryBalance table (lot_id, location_id, status, qty)
- [x] Add inventory status enum (available, hold, reserved)
- [x] Create InventoryTransaction ledger for all movements
- [x] Add transaction types: receive, consume, adjust, transfer, reserve, release, ship
- [x] Update inventory functions to use lot-level tracking
- [x] Add lot selection UI for inventory operations (via Core Operations)

### Work Order Output Completion
- [x] Add WorkOrderOutput table (wo_id, lot_id, qty, yield%)
- [x] Create finished goods lot on work order completion
- [x] Track yield percentage vs target
- [x] Update finished goods inventory on completion
- [x] Add output lot UI to work order detail page (via Core Operations)
### Alert System
- [x] Create Alert table (type, entity_ref, severity, status, assigned_to)
- [x] Alert types: low_stock, shortage, late_shipment, yield_variance, expiring_lot
- [x] Automatic alert generation for low stock conditions
- [x] Automatic alert generation for late shipments
- [x] Automatic alert generation for yield variance
- [x] Create Recommendation table with approval workflow
- [x] Alert dashboard with filtering and assignment (Core Operations right pane)
- [x] Alert notifications in header

### Shopify Integration Foundation
- [x] Create ShopifyStore table (domain, token, enabled)
- [x] Create WebhookEvent table (topic, payload, idempotency_key, status)
- [x] Create ShopifySkuMapping table (shopify_sku, product_id)
- [x] Create ShopifyLocationMapping table (shopify_location_id, warehouse_id)
- [x] Implement orders/create webhook endpoint
- [x] Implement orders/cancelled webhook endpoint
- [x] Implement orders/fulfilled webhook endpoint
- [x] Implement inventory_levels/update webhook endpoint
- [ ] Add Shopify settings page for store configuration (UI pending)

### Reservation System
- [x] Create SalesOrder table with lines
- [x] Create Reservation table (sales_order_id, lot_id, qty)
- [x] Implement reserve transaction (available → reserved)
- [x] Implement release transaction (reserved → available)
- [x] Implement ship transaction (reserved → 0, on_hand decreases)
- [x] Track available vs on_hand quantities separately

### Inventory Allocation by Channel
- [x] Create InventoryAllocation table (channel, product_id, allocated_qty, remaining_qty)
- [x] Create SalesEvent table for Shopify fulfillment tracking
- [x] Implement allocation workflow (ERP → Shopify)
- [x] Track allocation remaining vs Shopify inventory

### Inventory Reconciliation
- [x] Create ReconciliationRun table (scheduled/manual, status)
- [x] Create ReconciliationLine table (sku, erp_qty, shopify_qty, delta, variance%)
- [x] Implement reconciliation job
- [x] Add manual reconciliation trigger
- [x] Variance thresholds: pass ≤1 unit or ≤0.5%, warning, critical >3%
- [ ] Reconciliation report UI (pending)

### 3-Pane Core Operations Workspace
- [x] Create CoreOperations page with 3-pane layout
- [x] Left pane: Object tree (Sales Orders, POs, Work Orders, Inventory Lots)
- [x] Center pane: Selected object details + actions
- [x] Right pane: Alerts and recommendations
- [x] Tree navigation for drilling into objects
- [x] Context-aware action buttons
- [x] Real-time alert updates

### RBAC Refinement
- [x] All roles exist (admin, finance, ops, legal, exec, copacker, vendor, contractor)
- [x] Role-based procedure guards implemented
- [ ] Add Plant User role (Work Orders/Receiving/Inventory/Transfers only)
- [ ] Split Finance/Procurement permissions

## Integration Settings Page
- [x] Create Integrations settings page with tabbed layout
- [x] Shopify tab: store connection, API credentials, sync status, manual sync trigger
- [x] SendGrid tab: API key status, sender email config, test email button
- [x] Google tab: OAuth connection status, connected accounts, disconnect option
- [x] QuickBooks tab: connection status placeholder for future integration
- [x] Sync History tab: log of recent sync operations with status
- [x] Connection status indicators (connected/disconnected/error)
- [x] Last sync timestamps for each integration
- [x] Manual sync triggers for each service
- [x] Navigation link in sidebar under Settings

## Real-Time Notification System
- [x] Notifications database table (type, title, message, entity_ref, read status, user_id)
- [x] Notification preferences table (user settings for each notification type)
- [x] Backend procedures for creating, listing, marking read notifications
- [x] Shipping tracking update notifications (status changes, delivery updates)
- [x] Inventory level notifications (low stock, stock received, adjustments)
- [x] Purchase order notifications (PO approved, shipped, received, fulfilled)
- [x] Work order notifications (started, completed, material shortage)
- [x] Sales order notifications (new order, shipped, delivered)
- [x] Alert-to-notification bridge (convert alerts to user notifications)
- [x] Notification center UI in header with badge count
- [x] Real-time polling for new notifications (15-30 second intervals)
- [x] Mark as read/unread functionality
- [x] Notification preferences settings page
- [x] Email notification option for critical alerts (via preferences)
- [x] All 193 unit tests passing

## Email Scanning for Receipts & Documents

- [x] Database schema for email inbox (inbound emails, attachments, parsing status)
- [x] Database schema for parsed documents (receipts, invoices, POs extracted from emails)
- [x] AI-powered email content parsing using LLM
- [x] Receipt extraction (vendor, amount, date, line items, tax)
- [x] Purchase order extraction (PO number, vendor, items, quantities, prices)
- [x] Invoice extraction (invoice number, vendor, amounts, due date)
- [x] Freight document extraction (BOL, tracking numbers, carrier info)
- [x] Auto-create vendors from parsed email sender/content
- [x] Auto-create transactions from parsed receipts- [ ] Link parsed documents to existing POs and shipments
- [ ] Attachment parsing (PDF receipts, images of receipts)
- [ ] Email inbox UI with list of scanned emails
- [ ] Document review and approval workflow
- [ ] Manual email forwarding endpoint for processing
- [ ] Unit tests for email parsing functionality

## Email Auto-Categorization Enhancement
- [x] Enhance AI parser to detect email category from subject/body/attachments
- [x] Categories: Receipt, Purchase Order, Invoice, Shipping Confirmation, Freight Quote, General
- [x] Add confidence score for categorization
- [x] Update inbound emails table with category field
- [x] Display category badges in Email Inbox UI
- [x] Add category filter to email list
- [ ] Auto-route emails to appropriate workflows based on category

## Automatic Email Inbox Scanning
- [x] Connect to email inbox via IMAP/API (Gmail, Outlook, or generic IMAP)
- [x] Fetch all unread/new emails from inbox automatically
- [x] Scan and categorize entire inbox, not just individual submissions
- [x] Add email provider configuration (IMAP settings, OAuth for Gmail/Outlook)
- [x] Implement polling/webhook for new email detection
- [x] Bulk categorization of all inbox emails
- [x] Mark emails as processed after scanning
- [x] UI for configuring email inbox connection
- [x] UI for viewing scan progress and results
- [x] Manual "Scan Inbox" button to trigger full inbox scan

## Data Room Feature (DocSend-like)
- [x] Database schema for data rooms, folders, documents, permissions
- [x] Google Drive integration to sync folders and files
- [x] Password-protected data room pages at /dataroom
- [x] Granular view permissions (per folder, per document, per user)
- [x] Shareable links with access controls (password, expiry, download restrictions)
- [x] Viewer analytics and engagement tracking
- [x] View timelines showing who viewed what and when
- [x] Custom info capture on first access (name, email, company)
- [x] Data room invitations system
- [x] Folder hierarchy navigation UI
- [x] Document viewer with PDF/image preview
- [x] Download tracking and restrictions
- [x] Email notifications for new views

## Email Enhancement - IMAP Credentials Storage
- [x] Database table for storing IMAP credentials securely
- [x] Encrypt passwords before storage
- [x] UI to save/manage email connection settings
- [x] Auto-load saved credentials in scan dialog

## Email Enhancement - Scheduled Polling
- [x] Background job for periodic inbox scanning
- [x] Configurable polling interval (default 15 minutes)
- [x] Track last scan timestamp per account
- [x] Only fetch new emails since last scan
- [x] Notification when new emails are imported

## Email Enhancement - Attachment OCR Processing
- [x] Extract text from PDF attachments
- [x] OCR for image attachments (receipts, invoices)
- [x] Parse extracted text for invoice/receipt data
- [x] Link parsed data to parent email
- [x] UI to view extracted attachment content


## NDA E-Signature Feature
- [x] Add NDA document upload (PDF) to data rooms
- [x] Store NDA documents in S3 with data room association
- [x] Create signature capture UI (typed name, drawn signature, date)
- [x] Store signed NDA records with timestamp, IP, and signature image
- [x] Block data room access until NDA is signed
- [x] Allow viewing/downloading signed NDAs from admin panel
- [x] Send email notification when NDA is signed
- [x] Add signature verification and audit trail


## Enhanced Data Room Access Controls
- [x] Require email input before granting any access
- [x] Invitation-only mode - only invited emails can access
- [x] Per-folder permissions - restrict folders to specific visitors
- [x] Per-document permissions - restrict documents to specific visitors
- [x] User blocking - block specific visitors from accessing
- [x] Access revocation - revoke access for specific users
- [x] Document watermarking with visitor email address
- [x] Store signed NDA with visitor record
- [x] Send signed NDA copy to visitor via email
- [x] Admin UI for managing visitor permissions
- [x] Visitor access log with detailed activity


## Menu Consolidation
- [x] Combine Shipments, Receiving, Transfers into unified "Logistics" page with tabs
- [x] Combine POs, Vendors, Raw Materials into unified "Procurement" page with tabs
- [x] Combine Products, Inventory, BOM into unified "Inventory" page with tabs
- [x] Combine Work Orders with Core Operations
- [x] Simplify Operations menu to fewer top-level items
- [x] Update navigation with consolidated structure


## Hub-Based Page Redesign
- [x] Manufacturing Hub - Multi-column view with Inventory, BOM, Work Orders, Locations as panels
- [x] Procurement Hub - Multi-column view with POs, Vendors, Raw Materials, Receiving as panels
- [x] Logistics Hub - Multi-column view with Shipments, Transfers, Tracking as panels
- [x] Update navigation to use hub structure
- [x] Remove redundant separate pages


## Sales Hub Consolidation
- [x] Create Sales Hub with Orders, Invoices, Customers, Payments as 4 columns
- [x] Update navigation to use Sales Hub
- [x] Remove separate Sales and Finance menu sections where redundant


## Products & Invoice Enhancement
- [x] Move Products (finished goods) to Sales Hub as 5th column
- [x] Add product selection when creating invoices
- [x] Calculate invoice totals from selected products
- [x] Add email invoice to customer functionality
- [x] Remove Products from Operations menu


## Invoice Enhancements
- [x] PDF invoice generation with company branding
- [x] Attach PDF to invoice emails
- [x] Quick payment recording from invoice view
- [x] Mark invoice as paid when payment recorded
- [x] Recurring invoice templates
- [x] Auto-generate invoices on schedule (weekly/monthly)
- [x] Recurring invoice management UI


## Spreadsheet Views & PO Workflow Enhancement
- [x] Create reusable spreadsheet-style data table component with inline editing
- [x] Update Manufacturing Hub to use spreadsheet view as default
- [x] Update Procurement Hub to use spreadsheet view as default
- [x] Update Logistics Hub to use spreadsheet view as default
- [x] Update Sales Hub to use spreadsheet view as default
- [x] Add PO email to supplier functionality
- [x] Auto-generate shipment order when PO is sent
- [x] Auto-generate freight quote request when PO is sent
- [x] Request customs documentation in supplier email (invoice, packing list, dimensions, HS code)
- [x] Create supplier portal for document upload
- [x] Link uploaded documents to freight quote requests
- [x] Send documentation to freight vendors for quotes

## AI-Native UX Improvements (Jan 12, 2026)
- [x] Fix duplicate sidebar issue in hub pages
- [x] Remove redundant DashboardLayout wrappers from all pages
- [x] Embed AI Command Bar in DashboardLayout header
- [x] Add Cmd/Ctrl+K keyboard shortcut for AI Command Bar
- [x] Add Gmail-style keyboard navigation (g+d, g+a, g+s, g+m, g+p, g+l, g+e)
- [x] Add ? key to show keyboard shortcuts help
- [x] Update search bar to "Search or ask AI..." with keyboard hint
- [x] Add bulk actions toolbar to SpreadsheetTable component
- [x] Fix TypeScript errors in ManufacturingHub, ProcurementHub, SalesHub
- [x] Replace searchTerm prop with showSearch in SpreadsheetTable usage

## AI-Autonomous ERP Transformation (Jan 12, 2026)

### Procurement Hub Restructure
- [ ] Remove Receiving tab from Procurement Hub
- [ ] Add receiving status to Raw Materials (ordered, in_transit, received, inspected)
- [ ] Add expected delivery date and actual delivery date to raw materials
- [ ] Add quantity ordered vs quantity received tracking
- [ ] Update raw materials list to show receiving status inline

### Inline Editing
- [ ] Enable inline editing on Sales Hub spreadsheets (products, orders, invoices, customers)
- [ ] Enable inline editing on Procurement Hub spreadsheets (POs, vendors, materials)
- [ ] Enable inline editing on Manufacturing Hub spreadsheets (inventory, BOMs, work orders)
- [ ] Enable inline editing on Logistics Hub spreadsheets (shipments, RFQs)
- [ ] Wire up onCellEdit callbacks to mutation handlers

### Bulk Actions
- [ ] Add bulk delete action with confirmation dialog
- [ ] Add bulk status change action
- [ ] Add bulk export to CSV action
- [ ] Add bulk email action for selected vendors/customers
- [ ] Add bulk approve/reject for pending items

### AI Agent Orchestration System
- [ ] Create AI Agent table to track autonomous tasks
- [ ] Create AI Task Queue for pending AI operations
- [ ] Create AI Action Log for audit trail
- [ ] Build AI Agent scheduler for periodic checks
- [ ] Implement AI decision engine using LLM

### AI-Driven PO Auto-Generation
- [ ] AI monitors inventory levels and demand forecasts
- [ ] AI identifies materials needing reorder
- [ ] AI selects optimal vendor based on price/lead time/history
- [ ] AI generates draft PO with smart quantities
- [ ] AI queues PO for human approval
- [ ] Auto-send PO to vendor after approval

### AI-Driven RFQ Automation
- [ ] AI monitors upcoming shipment needs
- [ ] AI generates RFQ requests for freight quotes
- [ ] AI sends personalized emails to freight forwarders
- [ ] AI parses incoming quote responses
- [ ] AI compares and scores quotes
- [ ] AI recommends best quote for approval

### AI-Driven Email Automation
- [ ] AI drafts vendor follow-up emails for late deliveries
- [ ] AI drafts customer order confirmations
- [ ] AI drafts payment reminders
- [ ] AI drafts shipment status updates
- [ ] All emails queued for review before sending

### Approval Queue Dashboard
- [ ] Central approval queue showing all pending AI actions
- [ ] One-click approve/reject with comments
- [ ] Batch approval for low-risk items
- [ ] Escalation rules for high-value items
- [ ] Approval history and audit trail


## AI-Autonomous ERP Transformation
- [x] Remove Receiving tab from Procurement Hub (receiving is now a status on raw materials)
- [x] Add receiving status columns to Raw Materials table (onOrder, receivingStatus, expectedDeliveryDate)
- [x] Enable inline editing on spreadsheet cells across all hubs
- [x] Implement bulk action handlers (materials, vendors, POs)
- [x] Create AI Agent orchestration system (aiAgentTasks, aiAgentRules, aiAgentLogs tables)
- [x] Build AI-driven PO auto-generation with approval workflow (generatePoSuggestion mutation)
- [x] Build AI-driven RFQ suggestion system (generateRfqSuggestion mutation)
- [ ] Build AI-driven email automation for vendor communications (needs SendGrid)
- [x] Create approval queue dashboard for human oversight (/ai/approvals)
- [x] Add Approval Queue to sidebar navigation
- [x] AI bulk action: Create Reorder PO from selected materials

## Backend AI Operations Wiring (Jan 2026)
- [x] AI Agent task creation procedure with approval workflow
- [x] AI Agent task execution procedure (PO generation, RFQ sending, work orders)
- [x] Manufacturing Hub AI operations (start/complete production, bulk actions)
- [x] Procurement Hub AI operations (send POs, approve, cancel, reorder materials)
- [x] Work order bulk actions (start all, complete all, cancel all)
- [x] BOM bulk actions (AI: Create Work Orders)
- [x] PO bulk actions (send, approve, cancel)
- [x] Vendor bulk actions (activate, deactivate)
- [x] Material bulk actions (AI: Create Reorder PO, mark received, mark inspected)
- [x] All 258 unit tests passing

## Multi-Copacker Inventory UI (Jan 2026)
- [ ] Build unified Inventory page with three toggle views (Exceptions, By Item, By Location)
- [ ] Build Inventory by Item view with total owned, location breakdown, and actions
- [ ] Build Inventory by Location view with raw/semi-finished/finished goods sections
- [ ] Build Exceptions view showing delayed shipments, blocked production, yield variance, QC holds
- [ ] Build Production Order inline cards with inputs/outputs/yield visualization
- [ ] Build Shipment UI with one-click receive (auto inventory move, lot preservation)
- [ ] Add lot/batch inheritance display showing transformation lineage
- [ ] Implement copacker role restrictions (location-only view, no cost visibility)

## Multi-Copacker Inventory UI (Completed)
- [x] Unified Inventory page with three toggle views (Exceptions, By Item, By Location)
- [x] Inventory by Item view with location breakdown and status indicators
- [x] Inventory by Location view with expandable rows showing raw materials and finished goods
- [x] Exceptions view with resolve actions (Delayed Shipments, Blocked Production, Yield Variance, QC Holds)
- [x] Production Order inline cards with transformation visualization (Input Materials → Output)
- [x] Shipment UI with one-click receive for incoming transfers
- [x] Lot/batch inheritance display in expanded item views

## AICommandBar AI Agent Integration
- [x] Update AICommandBar to use aiAgent.tasks.create mutation instead of ai.query
- [x] Fix backend generate_po to accept rawMaterialName (not just rawMaterialId)
- [x] Handle missing vendor gracefully (return needs_vendor status and prompt user)
- [x] Change aiAgent.tasks.create to protectedProcedure for non-admin users

## Natural Language Parsing for AICommandBar
- [x] Parse quantities with units (50kg, 100 lbs, 25 cases, 1000 units)
- [x] Parse relative dates (next Friday, in 2 weeks, tomorrow, next month)
- [x] Parse absolute dates (March 15th, 2026-03-15, 3/15/26)
- [x] Integrate parsers into intent detection for PO generation

## Vendor Suggestion for AICommandBar
- [ ] Create backend procedure to get preferred vendor for material based on PO history
- [ ] Integrate vendor suggestion into AICommandBar when material name is parsed
- [ ] Show suggested vendor in task preview before submission

## Vendor Quote Management (RFQ System)
- [ ] Create vendorQuoteRequests and vendorQuotes database tables
- [ ] Build backend procedures for RFQ creation, quote submission, comparison
- [ ] Create email templates for vendor quote requests
- [ ] Build quote tracking UI in Procurement Hub
- [ ] Add best quote selection with price/lead time comparison
- [ ] Add one-click PO conversion from accepted quote


## Vendor Quote Management (RFQ System) - Completed
- [x] Create vendor RFQ and quote database tables (vendorRfqs, vendorRfqInvitations, vendorQuotes)
- [x] Build vendor quotes router with full CRUD operations
- [x] Implement RFQ email sending to multiple vendors
- [x] Build quote tracking and comparison UI in Procurement Hub (Quotes tab)
- [x] Implement best quote selection and PO conversion workflow
- [x] Add quote ranking by price, lead time, and overall score
- [x] Write comprehensive tests (20 tests passing, 278 total)

## Bug Fix: AI Command Bar Vendor Selection
- [x] Allow vendor selection when no preferred vendor is found for a material
- [x] Add vendor dropdown to AI Command Bar for PO generation
- [x] Allow proceeding with draft PO even without vendor selection

## AI Command Bar Enhancements
- [x] Add material autocomplete with search-as-you-type
- [x] Prompt user for missing required information (quantity, vendor, date)
- [x] Show draft preview of PO/RFQ before submitting for approval
- [x] Allow editing draft before final submission

## Quick Creation from Dropdowns and Pages
- [x] Create reusable QuickCreateDialog component
- [x] Add quick vendor creation to AICommandBar vendor dropdown
- [x] Add quick vendor creation to Procurement Hub
- [x] Add quick material creation to AICommandBar material dropdown
- [x] Add quick material creation to Procurement Hub
- [x] Add quick BOM creation to Manufacturing Hub
- [x] Add quick work order creation to Manufacturing Hub
- [x] Add empty state prompts with create buttons on all hub pages

## AI Command Bar and Agent Enhancements
- [x] Add "Create New" option at bottom of vendor dropdown in AI Command Bar
- [x] Add "Create New" option at bottom of material dropdown in AI Command Bar
- [x] Add "Create New" option at bottom of product dropdown in AI Command Bar (via quick actions)
- [x] Add "Create New" option at bottom of BOM dropdown in AI Command Bar (via quick actions)
- [x] Enhance AI agent to handle email replies automatically
- [x] Add AI agent capability for approval workflows
- [x] Add AI agent capability for automated task execution
- [x] Add direct "New" button to Purchase Orders tab
- [x] Add direct "New" button to Vendors tab
- [x] Add direct "New" button to Raw Materials tab
- [ ] Add direct "New" button to Inventory tab
- [x] Add direct "New" button to BOMs tab
- [x] Add direct "New" button to Work Orders tab
- [ ] Add direct "New" button to Locations tab

## AI Email Reply Automation
- [x] Create email reply generation service using LLM
- [x] Add email context analysis for appropriate tone and content
- [x] Integrate with SendGrid email service for delivery
- [x] Update AI agent task execution to handle email replies
- [x] Add email reply preview and approval flow
- [x] Create AI Reply button in Email Inbox page
- [x] Add AI Reply dialog with preview and edit
- [x] Add option to send immediately or queue for approval
- [x] Write tests for email reply generation
- [x] Test full email reply workflow

## Quick Create for All Items
- [x] Add New button to Inventory tab with location assignment
- [x] Add New button to Locations tab
- [x] Add New button to Customers tab (via QuickCreateDialog)
- [x] Add New button to Products tab (via QuickCreateDialog)
- [x] Add New button to Invoices tab (already exists as Create Invoice)
- [x] Add New button to Contracts tab (already exists as New Contract)
- [x] Add New button to Projects tab (already exists as New Project)

## Immediate AI Action Execution
- [x] Add "Approve & Execute Now" button to AI task cards
- [x] Execute approved tasks immediately without queue navigation
- [x] Show execution result feedback inline

## Sent Email Tracking
- [x] Add "Sent" tab to Email Inbox
- [x] Track all outbound emails (RFQ requests, PO notifications, etc.)
- [x] Link sent emails to their source entities (PO, RFQ, Invoice)
- [x] Track reply threading - match incoming replies to sent emails
- [x] Show email conversation view with sent/received messages

## Clickable Generated Items
- [x] Make AI-created vendors clickable with link to vendor detail
- [x] Make AI-created materials clickable with link to material detail
- [x] Make AI-created products clickable with link to product detail
- [x] Make AI-created customers clickable with link to customer detail
- [x] Show entity links in AI task completion messages

## Email Delete/Archive and Smart Folders
- [x] Add delete button to email actions
- [x] Add archive button to email actions  
- [x] Create smart folders: Sales, Raw Materials, Copackers, Freight, General
- [x] Add folder sidebar to Email Inbox
- [x] Auto-categorize emails into folders based on content/sender
- [x] Add folder filter to email list view
- [x] Add bulk delete/archive for selected emails

## Auto-Reply Rules
- [x] Create auto_reply_rules database table
- [x] Add Auto-Reply Rules settings page
- [x] Configure rules by email category (Invoice, PO, RFQ, etc.)
- [x] Set custom reply templates per category
- [x] Enable/disable auto-reply per category
- [x] Add delay option before auto-reply
- [x] Log auto-replies in email history

## Historical Document Import System
- [x] Create document upload infrastructure for POs and freight invoices
- [x] Build AI-powered document parser for various formats (PDF, Excel, CSV)
- [x] Create PO import processor to extract vendor, materials, quantities, prices
- [x] Update inventory records from imported POs (mark as received)
- [x] Create freight invoice import processor for carrier, costs, shipment details
- [x] Build freight history tracking from imported invoices
- [x] Create import preview UI with data validation
- [x] Add import confirmation with edit capability before commit
- [x] Create import history log to track all imports
- [ ] Add bulk import support for multiple documents

## Google Drive Document Import
- [x] Add Google Drive tab to Document Import page
- [x] Implement folder browser using existing Google OAuth
- [x] List files in selected folder (PDFs, Excel, CSV)
- [x] Enable batch selection of multiple files
- [x] Download and process selected files through AI parser
- [x] Show batch import progress with per-file status
- [x] Add import results summary for batch operations


## Bug Fixes and Improvements (January 2026)
- [x] Fix TypeScript errors in aiAgentScheduler.ts (correct field names and db import)
- [x] Fix JSX structure errors in EmailInbox.tsx (missing closing div tag)
- [x] Verify Contracts page has New button (already implemented)
- [x] Verify Projects page has New button (already implemented)
- [x] Add clickable links for AI-generated items in AICommandBar (navigate to created records)
- [x] Bulk email selection already implemented (selectedEmails state with checkboxes)
- [x] Bulk delete/archive functionality already implemented (bulk action handlers)

## Document Uploader Bug Fix
- [x] Fix "Could not determine document type" error in document uploader
- [x] Debug document uploader still failing after initial fix - Fixed error handling in FileReader callback

## PDF Support for Document Uploader
- [x] Implement PDF-to-image conversion on the server (using pdftoppm - sandbox only)
- [x] Test PDF upload and verify parsing works
- [x] Fix PDF processing for production (replaced pdftoppm with pdfjs-dist text extraction)

## Document Uploader Bug (User Report)
- [x] Debug "Could not determine document type" error still occurring for user uploads
- [x] Root cause: pdftoppm command-line tool not available in production environment
- [x] Solution: Use pdfjs-dist pure JavaScript library for PDF text extraction

## Bug Fix: Document Import Google Connection Error
- [x] Fix "Google account not connected" error on /operations/document-import page
- [x] Make Google Drive integration optional for basic document upload
- [x] Ensure upload tab works without Google connection

## Consolidate Operations Pages
- [x] Design unified Operations page structure with tabs for Inventory, Manufacturing, and Procurement
- [x] Create new consolidated Operations page component
- [x] Move Inventory content to Operations/Inventory tab
- [x] Move Manufacturing content to Operations/Manufacturing tab
- [x] Move Procurement content to Operations/Procurement tab
- [x] Update sidebar navigation to remove separate Inventory, Manufacturing, Procurement items
- [x] Add single "Operations" menu item in sidebar
- [x] Update routing in App.tsx
- [x] Test all functionality in consolidated view

## Fix TypeScript Error in InventoryHub
- [x] Fix missing 'mode' property error on shipment objects in InventoryHub.tsx line 1663
- [x] Verify shipment type definition includes all required properties
- [x] Updated getFreightBookings to include quote and carrier relations

## Fix Duplicate Key Error in Navigation
- [x] Fix duplicate `/crm` key in DashboardLayout navigation
- [x] Ensure all navigation items have unique keys
