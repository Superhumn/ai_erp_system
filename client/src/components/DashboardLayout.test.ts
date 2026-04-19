/**
 * Navigation structure guard — prevents regressions to the sidebar layout.
 *
 * If this test fails, it means someone changed the nav groups or their order.
 * The canonical structure was agreed on 2026-04-19.  Do NOT update these
 * assertions without explicit product approval.
 */
import { describe, it, expect } from "vitest";
import { getMenuGroups } from "./DashboardLayout";

// ── Canonical section order for admin (never reorder / rename without approval) ──
const CANONICAL_SECTIONS = [
  "_main",
  "Sales & Finance",
  "CRM",
  "Operations",
  "_sell",
  "_ops",
  "_people",
  "_tools",
] as const;

describe("Sidebar navigation structure", () => {
  // Admin sees every section
  const adminGroups = getMenuGroups("admin");

  it("has exactly 8 sections for admin", () => {
    expect(adminGroups.map((g) => g.label)).toEqual([...CANONICAL_SECTIONS]);
  });

  it("preserves section order", () => {
    const labels = adminGroups.map((g) => g.label);
    for (let i = 0; i < CANONICAL_SECTIONS.length; i++) {
      expect(labels[i]).toBe(CANONICAL_SECTIONS[i]);
    }
  });

  // ── _main ──
  it("_main has Dashboard, Projects, AI Assistant, Approval Queue", () => {
    const main = adminGroups.find((g) => g.label === "_main")!;
    expect(main.items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Projects",
      "AI Assistant",
      "Approval Queue",
    ]);
  });

  // ── Sales & Finance ──
  it("Sales & Finance has Sales Hub, Fundraising CRM, Investors, Campaigns, Accounts, Transactions, R&D Tax Credit", () => {
    const sf = adminGroups.find((g) => g.label === "Sales & Finance")!;
    expect(sf.items.map((i) => i.label)).toEqual([
      "Sales Hub",
      "Fundraising CRM",
      "Investors",
      "Campaigns",
      "Accounts",
      "Transactions",
      "R&D Tax Credit",
    ]);
  });

  // ── CRM ──
  it("CRM has CRM Hub, Contacts, Messaging", () => {
    const crm = adminGroups.find((g) => g.label === "CRM")!;
    expect(crm.items.map((i) => i.label)).toEqual([
      "CRM Hub",
      "Contacts",
      "Messaging",
    ]);
  });

  // ── Operations ──
  it("Operations has Operations, Inventory, Inventory Mgmt, Manufacturing, Procurement, Logistics, Email Inbox, Meetings, Messaging", () => {
    const ops = adminGroups.find((g) => g.label === "Operations")!;
    expect(ops.items.map((i) => i.label)).toEqual([
      "Operations",
      "Inventory",
      "Inventory Mgmt",
      "Manufacturing",
      "Procurement",
      "Logistics",
      "Email Inbox",
      "Meetings",
      "Messaging",
    ]);
  });

  // ── _sell (admin) ──
  it("_sell has Orders, CRM, Support, Marketing, Financials, Fundraising for admin", () => {
    const sell = adminGroups.find((g) => g.label === "_sell")!;
    expect(sell.items.map((i) => i.label)).toEqual([
      "Orders",
      "CRM",
      "Support",
      "Marketing",
      "Financials",
      "Fundraising",
    ]);
  });

  // ── _ops (admin) ──
  it("_ops has Inventory, Recipes, Freight, Vendors for admin", () => {
    const opsGroup = adminGroups.find((g) => g.label === "_ops")!;
    expect(opsGroup.items.map((i) => i.label)).toEqual([
      "Inventory",
      "Recipes",
      "Freight",
      "Vendors",
    ]);
  });

  // ── _people (admin) ──
  it("_people has People, Recruiting, Investors, Legal for admin", () => {
    const people = adminGroups.find((g) => g.label === "_people")!;
    expect(people.items.map((i) => i.label)).toEqual([
      "People",
      "Recruiting",
      "Investors",
      "Legal",
    ]);
  });

  // ── _tools (admin) ──
  it("_tools has SOPs, Data Room, Grants, Import, EDI, Code, Settings for admin", () => {
    const tools = adminGroups.find((g) => g.label === "_tools")!;
    expect(tools.items.map((i) => i.label)).toEqual([
      "SOPs",
      "Data Room",
      "Grants",
      "Import",
      "EDI",
      "Code",
      "Settings",
    ]);
  });

  // ── Role-based visibility ──
  describe("role gating", () => {
    it("basic user sees _main, Sales & Finance, CRM, Operations, _people, _tools (no _sell or _ops)", () => {
      const groups = getMenuGroups("user");
      expect(groups.map((g) => g.label)).toEqual([
        "_main",
        "Sales & Finance",
        "CRM",
        "Operations",
        "_people",
        "_tools",
      ]);
    });

    it("ops user sees _sell and _ops", () => {
      const groups = getMenuGroups("ops");
      const labels = groups.map((g) => g.label);
      expect(labels).toContain("_sell");
      expect(labels).toContain("_ops");
    });

    it("_ops has Inventory, Recipes, Freight, Vendors for ops user", () => {
      const groups = getMenuGroups("ops");
      const opsGroup = groups.find((g) => g.label === "_ops")!;
      expect(opsGroup.items.map((i) => i.label)).toEqual([
        "Inventory",
        "Recipes",
        "Freight",
        "Vendors",
      ]);
    });

    it("finance user sees _sell but not _ops", () => {
      const groups = getMenuGroups("finance");
      const labels = groups.map((g) => g.label);
      expect(labels).toContain("_sell");
      expect(labels).not.toContain("_ops");
    });

    it("sales user sees _sell but not _ops", () => {
      const groups = getMenuGroups("sales");
      const labels = groups.map((g) => g.label);
      expect(labels).toContain("_sell");
      expect(labels).not.toContain("_ops");
    });

    it("exec sees Recipes in _ops", () => {
      const groups = getMenuGroups("exec");
      const opsGroup = groups.find((g) => g.label === "_ops")!;
      expect(opsGroup.items.map((i) => i.label)).toContain("Recipes");
    });

    it("Code and Settings are admin-only in _tools", () => {
      const userTools = getMenuGroups("user").find((g) => g.label === "_tools")!;
      const labels = userTools.items.map((i) => i.label);
      expect(labels).not.toContain("Code");
      expect(labels).not.toContain("Settings");

      const adminTools = getMenuGroups("admin").find((g) => g.label === "_tools")!;
      const adminLabels = adminTools.items.map((i) => i.label);
      expect(adminLabels).toContain("Code");
      expect(adminLabels).toContain("Settings");
    });

    it("legal user sees Legal in _people", () => {
      const groups = getMenuGroups("legal");
      const people = groups.find((g) => g.label === "_people")!;
      expect(people.items.map((i) => i.label)).toContain("Legal");
    });

    it("non-legal user does not see Legal in _people", () => {
      const groups = getMenuGroups("user");
      const people = groups.find((g) => g.label === "_people")!;
      expect(people.items.map((i) => i.label)).not.toContain("Legal");
    });
  });
});
