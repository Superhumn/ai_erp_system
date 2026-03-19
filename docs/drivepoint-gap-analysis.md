# DrivePoint Feature Gap Analysis

**Date:** 2026-03-19
**Purpose:** Identify DrivePoint.io features that are missing from or underdeveloped in our AI ERP system.

---

## What DrivePoint Is

DrivePoint is an AI-powered FP&A (Financial Planning & Analysis) platform built exclusively for consumer brands. It focuses on financial modeling, forecasting, and reporting — delivering strategic finance capabilities at scale. Their core value prop: replace spreadsheet-driven finance with automated, AI-powered planning across DTC, Amazon, wholesale, and retail channels.

---

## Feature Comparison

### Already Covered (We Have These)

| DrivePoint Feature | Our Implementation |
|---|---|
| SKU-level demand forecasting | `forecasting` router — AI-generated demand forecasts per product |
| Inventory management | Full inventory system with warehouses, transfers, lots, costing |
| Product profitability / COGS tracking | `cogs` router with cost layers, period summaries, profitability page |
| QuickBooks integration | Full OAuth integration, account sync, chart of accounts |
| Shopify integration | Store sync, SKU mappings, location mappings, order import |
| Purchase order generation from forecasts | Suggested POs generated from demand forecasts |
| Production planning | Production plans with material requirements from forecasts |
| Vendor management | Vendors, RFQs, quotes, negotiations, email automation |
| AI-powered analysis | AI agent service, autonomous workflows, LLM integration |
| Reporting / dashboards | Dashboard with summary metrics, profitability reports |

### MISSING — High Priority Features We Need

#### 1. Financial Scenario Planning & Modeling
**DrivePoint's core differentiator.** They let users build custom what-if scenarios (e.g., "what if we increase ad spend 20%?" or "what if COGS rises 10%?") and instantly see the impact across revenue, COGS, gross margin, OpEx, EBITDA, and cash balance.

- **What we lack:** No scenario modeling engine. No ability to create, compare, or save financial scenarios. No "SmartModel" equivalent that connects assumptions to full P&L outcomes.
- **Priority:** HIGH — this is the #1 feature DrivePoint sells.

#### 2. Cash Flow Forecasting & Weekly Cash Position
DrivePoint tracks weekly cash position incorporating outstanding POs, supplier payment terms, expected retail partner collections, and seasonal patterns. Shows whether you'll have enough cash for the next inventory order or face a shortfall in 6 weeks.

- **What we lack:** No cash flow forecasting. We track transactions and payments but don't project future cash positions.
- **Priority:** HIGH — critical for consumer brand operations.

#### 3. Rolling Financial Forecasts (P&L + Cash Flow + Balance Sheet)
DrivePoint produces rolling 12-18 month forecasts that include a detailed P&L, cash flow statement, and balance sheet, updating monthly.

- **What we lack:** Our forecasting is demand/inventory focused only. No financial statement forecasting (P&L projections, balance sheet projections).
- **Priority:** HIGH

#### 4. Real-Time Pacing & Performance vs. Plan
DrivePoint offers daily pacing algorithms that show how you're tracking against budget/plan at any point in the month. Flexible scorecards let teams check in mid-month.

- **What we lack:** No budget/plan setting. No pacing metrics. No performance-vs-plan tracking.
- **Priority:** HIGH

#### 5. P&L Variance Analysis
Automated monthly review reports showing profit & loss variance — actual vs. budget/forecast with drill-down.

- **What we lack:** We have profitability tracking but no variance analysis against budgets or prior forecasts.
- **Priority:** HIGH

#### 6. EBITDA Tracking & Optimization
DrivePoint customers improve EBITDA margins by an average of 6.7 points. The platform explicitly tracks and optimizes for EBITDA.

- **What we lack:** No EBITDA calculation or tracking anywhere in the system.
- **Priority:** MEDIUM-HIGH

### MISSING — Medium Priority Features

#### 7. Marketing Spend & CAC Tracking
DrivePoint tracks DTC marketing spend and customer acquisition cost (CAC) trends as part of their reporting suite.

- **What we lack:** No marketing spend tracking. No CAC calculation. No connection between ad spend and customer acquisition.
- **Priority:** MEDIUM — important for DTC brands.

#### 8. Amazon Channel Integration
DrivePoint has a first-of-its-kind Amazon API integration with sales reports, cohort analysis, and forecasts.

- **What we lack:** We have Shopify but no Amazon Seller Central / Vendor Central integration.
- **Priority:** MEDIUM — essential if targeting omnichannel consumer brands.

#### 9. Cohort Analysis & Customer LTV
DrivePoint offers returning customer prediction engines and cohort analysis across channels (works for both Shopify and Amazon).

- **What we lack:** No cohort analysis. No customer lifetime value modeling. No returning customer predictions.
- **Priority:** MEDIUM

#### 10. Inventory Aging Reports
DrivePoint auto-generates inventory aging reports flagging products approaching 90, 120, or 180 days of age.

- **What we lack:** We track inventory but have no aging analysis or automated alerts for slow-moving stock.
- **Priority:** MEDIUM

#### 11. Cash Conversion Cycle Tracking
DrivePoint reports on cash conversion cycle trends — how long it takes to convert inventory investment back to cash.

- **What we lack:** No cash conversion cycle metric tracked anywhere.
- **Priority:** MEDIUM

#### 12. Multi-Channel Unified Analytics
DrivePoint consolidates DTC, Amazon, wholesale, and retail data into unified views so teams can compare channel performance side-by-side.

- **What we lack:** Shopify data comes in but there's no unified multi-channel analytics view. EDI handles wholesale transactions but doesn't roll up into channel-level P&L.
- **Priority:** MEDIUM

### MISSING — Lower Priority / Nice-to-Have

#### 13. Budget Management
Setting annual/quarterly budgets that scenarios and pacing track against.

- **What we lack:** No budget module.
- **Priority:** MEDIUM (prerequisite for pacing and variance features above)

#### 14. Stripe / Payment Processor Integration
DrivePoint integrates with Stripe for payment data consolidation.

- **What we lack:** No Stripe integration.
- **Priority:** LOW-MEDIUM

#### 15. Google Ads Integration
DrivePoint pulls Google Ads data for marketing spend analytics.

- **What we lack:** No advertising platform integrations.
- **Priority:** LOW — depends on marketing spend feature (#7)

#### 16. Excel Export / Bi-directional Integration
DrivePoint added Excel integration for users who still want spreadsheet workflows.

- **What we lack:** We have basic data tables but no Excel export or bi-directional sync.
- **Priority:** LOW

---

## Recommended Build Order

If we want to match DrivePoint's core value prop for consumer brands:

1. **Budget Management** (foundation for everything below)
2. **Financial Scenario Planning & Modeling** (highest impact differentiator)
3. **Cash Flow Forecasting** (directly actionable for operations)
4. **Rolling Financial Forecasts** (P&L + Balance Sheet projections)
5. **Performance vs. Plan / Pacing** (daily operational value)
6. **P&L Variance Analysis** (monthly reporting)
7. **EBITDA Tracking**
8. **Inventory Aging Reports** (quick win)
9. **Cash Conversion Cycle**
10. **Marketing Spend / CAC** + Google Ads integration
11. **Amazon Integration**
12. **Cohort Analysis / Customer LTV**
13. **Multi-Channel Unified Analytics**

---

## Summary

Our system is strong on **operational ERP** (inventory, procurement, manufacturing, freight, EDI, vendor management) — areas where DrivePoint is weak or nonexistent. However, we are **missing DrivePoint's entire FP&A layer**: scenario modeling, cash flow forecasting, rolling financial forecasts, budget pacing, and variance analysis. These are the features that make DrivePoint compelling to consumer brand finance teams.

The good news: we already have the underlying data (transactions, invoices, COGS, inventory, orders) needed to build these features. The gap is in the **planning, projection, and analysis layer** on top of that data.
