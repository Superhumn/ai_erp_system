/**
 * Navigation structure guard — prevents regressions to the sidebar layout.
 *
 * If this test fails, it means someone changed the nav groups or their order.
 * The canonical structure was agreed on 2026-04-15.  Do NOT update these
 * assertions without explicit product approval.
 */
import { describe, it, expect } from "vitest";
import { getMenuGroups } from "./DashboardLayout";

// ── Canonical section order (never reorder / rename without approval) ──
const CANONICAL_SECTIONS = [
  "Command Center",
  "Sales",
  "Finance",
  "Operations",
  "People",
  "Tools",
] as const;

describe("Sidebar navigation structure", () => {
  // Admin sees every section
  const adminGroups = getMenuGroups("admin");

  it("has exactly 6 sections for admin", () => {
    expect(adminGroups.map((g) => g.label)).toEqual([...CANONICAL_SECTIONS]);
  });

  it("preserves section order", () => {
    const labels = adminGroups.map((g) => g.label);
    for (let i = 0; i < CANONICAL_SECTIONS.length; i++) {
      expect(labels[i]).toBe(CANONICAL_SECTIONS[i]);
    }
  });

  // ── Command Center ──
  it("Command Center has Dashboard, Projects, Email Inbox, Meetings, Messaging", () => {
    const cc = adminGroups.find((g) => g.label === "Command Center")!;
    expect(cc.items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Projects",
      "Email Inbox",
      "Meetings",
      "Messaging",
    ]);
  });

  // ── Sales ──
  it("Sales has Orders, Sales / CRM, Marketing (admin)", () => {
    const sales = adminGroups.find((g) => g.label === "Sales")!;
    expect(sales.items.map((i) => i.label)).toEqual([
      "Orders",
      "Sales / CRM",
      "Marketing",
    ]);
  });

  // ── Finance ──
  it("Finance has Finance, Grants, Fundraising, Investors, Data Room", () => {
    const fin = adminGroups.find((g) => g.label === "Finance")!;
    expect(fin.items.map((i) => i.label)).toEqual([
      "Finance",
      "Grants",
      "Fundraising",
      "Investors",
      "Data Room",
    ]);
  });

  // ── Operations ──
  it("Operations has Operations, Logistics, Recipes, Vendors (admin)", () => {
    const ops = adminGroups.find((g) => g.label === "Operations")!;
    expect(ops.items.map((i) => i.label)).toEqual([
      "Operations",
      "Logistics",
      "Recipes",
      "Vendors",
    ]);
  });

  // ── People ──
  it("People has HR, Recruiting, Legal (admin)", () => {
    const people = adminGroups.find((g) => g.label === "People")!;
    expect(people.items.map((i) => i.label)).toEqual([
      "HR",
      "Recruiting",
      "Legal",
    ]);
  });

  // ── Tools ──
  it("Tools has SOPs, Code, Settings, Import, EDI (admin)", () => {
    const tools = adminGroups.find((g) => g.label === "Tools")!;
    expect(tools.items.map((i) => i.label)).toEqual([
      "SOPs",
      "Code",
      "Settings",
      "Import",
      "EDI",
    ]);
  });

  // ── Role-based visibility ──
  describe("role gating", () => {
    it("basic user sees only Command Center, People, Tools (SOPs only)", () => {
      const groups = getMenuGroups("user");
      expect(groups.map((g) => g.label)).toEqual([
        "Command Center",
        "People",
        "Tools",
      ]);
      const tools = groups.find((g) => g.label === "Tools")!;
      expect(tools.items.map((i) => i.label)).toEqual(["SOPs"]);
    });

    it("ops user sees Sales (Orders only), Operations, but no Finance", () => {
      const groups = getMenuGroups("ops");
      const labels = groups.map((g) => g.label);
      expect(labels).toContain("Sales");
      expect(labels).toContain("Operations");
      expect(labels).not.toContain("Finance");

      const sales = groups.find((g) => g.label === "Sales")!;
      expect(sales.items.map((i) => i.label)).toEqual(["Orders"]);
    });

    it("finance user sees Finance but not Sales or Operations", () => {
      const groups = getMenuGroups("finance");
      const labels = groups.map((g) => g.label);
      expect(labels).toContain("Finance");
      expect(labels).not.toContain("Sales");
      expect(labels).not.toContain("Operations");
    });

    it("sales user sees Sales (full) but not Finance or Operations", () => {
      const groups = getMenuGroups("sales");
      const labels = groups.map((g) => g.label);
      expect(labels).toContain("Sales");
      expect(labels).not.toContain("Finance");
      expect(labels).not.toContain("Operations");

      const sales = groups.find((g) => g.label === "Sales")!;
      expect(sales.items.map((i) => i.label)).toEqual([
        "Orders",
        "Sales / CRM",
        "Marketing",
      ]);
    });

    it("exec sees Recipes (isAdmin = true)", () => {
      const groups = getMenuGroups("exec");
      const ops = groups.find((g) => g.label === "Operations")!;
      expect(ops.items.map((i) => i.label)).toContain("Recipes");
    });

    it("Recipes hidden from exec-only when not admin/ops", () => {
      // exec IS admin (isAdmin includes exec), so they see Recipes.
      // A hypothetical non-admin, non-ops role with hasOps would not.
      // This test documents that exec = admin-equivalent for Recipes.
      const groups = getMenuGroups("exec");
      const ops = groups.find((g) => g.label === "Operations")!;
      expect(ops.items.map((i) => i.label)).toContain("Recipes");
    });

    it("Code and Settings are admin-only", () => {
      const userTools = getMenuGroups("user").find((g) => g.label === "Tools")!;
      const labels = userTools.items.map((i) => i.label);
      expect(labels).not.toContain("Code");
      expect(labels).not.toContain("Settings");

      const adminTools = getMenuGroups("admin").find((g) => g.label === "Tools")!;
      const adminLabels = adminTools.items.map((i) => i.label);
      expect(adminLabels).toContain("Code");
      expect(adminLabels).toContain("Settings");
    });

    it("legal user sees Legal in People", () => {
      const groups = getMenuGroups("legal");
      const people = groups.find((g) => g.label === "People")!;
      expect(people.items.map((i) => i.label)).toContain("Legal");
    });

    it("non-legal user does not see Legal", () => {
      const groups = getMenuGroups("user");
      const people = groups.find((g) => g.label === "People")!;
      expect(people.items.map((i) => i.label)).not.toContain("Legal");
    });
  });

  // ── Things that must NOT exist in the nav ──
  describe("removed items stay removed", () => {
    const allLabels = getMenuGroups("admin")
      .flatMap((g) => [g.label, ...g.items.map((i) => i.label)]);

    it.each([
      "Sales & Finance",
      "CRM",
      "Communications",
      "AI Assistant",
      "Approval Queue",
      "Support",
      "Equity Portal",
      "Time Tracking",
      "Inventory Mgmt",
    ])("%s must not appear in sidebar", (label) => {
      expect(allLabels).not.toContain(label);
    });
  });
});
