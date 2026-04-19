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

  it("_main has Dashboard, Projects, AI Assistant, Approval Queue", () => {
    const main = adminGroups.find((g) => g.label === "_main")!;
    expect(main.items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Projects",
      "AI Assistant",
      "Approval Queue",
    ]);
  });

  it("Sales & Finance contains key finance and sales items", () => {
    const sf = adminGroups.find((g) => g.label === "Sales & Finance")!;
    const labels = sf.items.map((i) => i.label);
    expect(labels).toContain("Sales Hub");
    expect(labels).toContain("Accounts");
    expect(labels).toContain("Transactions");
  });

  it("CRM has CRM Hub, Contacts, Messaging", () => {
    const crm = adminGroups.find((g) => g.label === "CRM")!;
    expect(crm.items.map((i) => i.label)).toEqual([
      "CRM Hub",
      "Contacts",
      "Messaging",
    ]);
  });

  it("Operations contains Operations, Inventory, Logistics", () => {
    const ops = adminGroups.find((g) => g.label === "Operations")!;
    const labels = ops.items.map((i) => i.label);
    expect(labels).toContain("Operations");
    expect(labels).toContain("Inventory");
    expect(labels).toContain("Logistics");
  });

  it("_sell contains Orders, CRM, Support for admin", () => {
    const sell = adminGroups.find((g) => g.label === "_sell")!;
    const labels = sell.items.map((i) => i.label);
    expect(labels).toContain("Orders");
    expect(labels).toContain("CRM");
    expect(labels).toContain("Support");
    expect(labels).toContain("Marketing");
  });

  it("_ops has Inventory, Recipes, Freight, Vendors for admin", () => {
    const opsGroup = adminGroups.find((g) => g.label === "_ops")!;
    expect(opsGroup.items.map((i) => i.label)).toEqual([
      "Inventory",
      "Recipes",
      "Freight",
      "Vendors",
    ]);
  });

  it("_people includes People, Recruiting, Investors, and Legal for admin", () => {
    const people = adminGroups.find((g) => g.label === "_people")!;
    const labels = people.items.map((i) => i.label);
    expect(labels).toContain("People");
    expect(labels).toContain("Recruiting");
    expect(labels).toContain("Investors");
    expect(labels).toContain("Legal");
  });

  it("_tools contains SOPs, Code, Settings for admin", () => {
    const tools = adminGroups.find((g) => g.label === "_tools")!;
    const labels = tools.items.map((i) => i.label);
    expect(labels).toContain("SOPs");
    expect(labels).toContain("Code");
    expect(labels).toContain("Settings");
    expect(labels).toContain("Data Room");
    expect(labels).toContain("Grants");
  });

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

    it("_tools always includes SOPs, Code, Settings for all roles", () => {
      const userTools = getMenuGroups("user").find((g) => g.label === "_tools")!;
      const labels = userTools.items.map((i) => i.label);
      expect(labels).toContain("SOPs");
      expect(labels).toContain("Code");
      expect(labels).toContain("Settings");
    });

    it("Data Room, Grants, Import, EDI are admin-only in _tools", () => {
      const userLabels = getMenuGroups("user").find((g) => g.label === "_tools")!.items.map((i) => i.label);
      expect(userLabels).not.toContain("Data Room");
      expect(userLabels).not.toContain("Grants");
      expect(userLabels).not.toContain("Import");
      expect(userLabels).not.toContain("EDI");

      const adminLabels = getMenuGroups("admin").find((g) => g.label === "_tools")!.items.map((i) => i.label);
      expect(adminLabels).toContain("Data Room");
      expect(adminLabels).toContain("Grants");
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
