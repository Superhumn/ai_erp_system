# AI ERP System — Development Guide

## Sidebar Navigation (LOCKED)

The sidebar structure is **frozen** and enforced by `client/src/components/DashboardLayout.test.ts` (26 tests).
Do NOT reorganize, rename, reorder, or add sections without explicit product approval.
Any change to `getMenuGroups()` will fail CI.

### Canonical structure (agreed 2026-04-15)

| # | Section         | Roles                  | Items                                              |
|---|-----------------|------------------------|----------------------------------------------------|
| 1 | Command Center  | all                    | Dashboard, Projects, Email Inbox, Meetings, Messaging |
| 2 | Sales           | sales, ops, admin, exec | Orders; CRM + Marketing (sales/admin/exec only)   |
| 3 | Finance         | finance, admin, exec   | Finance, Grants, Fundraising, Investors, Data Room |
| 4 | Operations      | ops, admin, exec       | Operations, Logistics, Recipes (admin/ops), Vendors |
| 5 | People          | all                    | HR, Recruiting, Legal (legal/admin/exec)           |
| 6 | Tools           | all (items gated)      | SOPs; Code+Settings (admin); Import (admin/ops); EDI (ops) |

### Key constraints

- **AI Assistant + Approval Queue** live in the top menu bar, NOT the sidebar.
- **Support** is a panel inside Orders (customer click), not a nav item.
- **Finance** = single consolidated page (Accounts + Transactions + Reports + R&D Tax Credit).
- **Operations** = single consolidated page (Inventory + Manufacturing + Procurement).
- **Logistics** = merged Logistics + Freight.
- **Fundraising** = merged Fundraising + Campaigns.
- **Investors** = includes cap table / equity portal. Investor-role users see their own share view.
- **Recipes** restricted to admin + ops only (trade secrets).
- **Code / Settings** admin-only.
- **Equity Portal / Time Tracking** removed from sidebar (absorbed into HR and Investors respectively).

### Items that must NEVER reappear in the sidebar

`Sales & Finance`, `CRM` (as section), `Communications` (as section), `AI Assistant`,
`Approval Queue`, `Support`, `Equity Portal`, `Time Tracking`, `Inventory Mgmt`
