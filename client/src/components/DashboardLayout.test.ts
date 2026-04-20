/**
 * Navigation structure guard — prevents regressions to the sidebar layout.
 *
 * If this test fails, it means someone changed the nav groups or their order.
 * The canonical structure was agreed on 2026-04-15 (see CLAUDE.md). Do NOT
 * update these assertions without explicit product approval.
 */
import { describe, it, expect } from "vitest";
import { getMenuGroups } from "./DashboardLayout";

// ── Canonical section order for admin (never reorder / rename without approval) ──
const CANONICAL_SECTIONS = [
  "Command Center",
  "Sales",
  "Finance",
  "Operations",
  "People",
  "Tools",
] as const;

// Items that must NEVER reappear in the sidebar (see CLAUDE.md)
const BANNED_LABELS = [
  "Sales & Finance",
  "CRM Hub",
  "Contacts",
  "AI Assistant",
  "Approval Queue",
  "Support",
  "Equity Portal",
  "Time Tracking",
  "Inventory Mgmt",
  "Manufacturing",
  "Procurement",
  "Freight",
  "Financials",
  "Cases",
];

const BANNED_SECTION_LABELS = ["Sales & Finance", "CRM", "Communications"];

function labelsOf(role: string) {
  return getMenuGroups(role).flatMap((g) => g.items.map((i) => i.label));
}

describe("Sidebar navigation structure", () => {
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

  it("Sales contains Orders, CRM, Marketing for admin", () => {
    const sales = adminGroups.find((g) => g.label === "Sales")!;
    expect(sales.items.map((i) => i.label)).toEqual([
      "Orders",
      "CRM",
      "Marketing",
    ]);
  });

  it("Finance contains Finance, Grants, Fundraising, Investors, Data Room", () => {
    const fin = adminGroups.find((g) => g.label === "Finance")!;
    expect(fin.items.map((i) => i.label)).toEqual([
      "Finance",
      "Grants",
      "Fundraising",
      "Investors",
      "Data Room",
    ]);
  });

  it("Operations has Operations, Logistics, Recipes, Vendors (single consolidated page)", () => {
    const ops = adminGroups.find((g) => g.label === "Operations")!;
    expect(ops.items.map((i) => i.label)).toEqual([
      "Operations",
      "Logistics",
      "Recipes",
      "Vendors",
    ]);
  });

  it("People has HR, Recruiting, Legal for admin", () => {
    const people = adminGroups.find((g) => g.label === "People")!;
    expect(people.items.map((i) => i.label)).toEqual([
      "HR",
      "Recruiting",
      "Legal",
    ]);
  });

  it("Tools has SOPs, Code, Settings, Import, EDI for admin", () => {
    const tools = adminGroups.find((g) => g.label === "Tools")!;
    expect(tools.items.map((i) => i.label)).toEqual([
      "SOPs",
      "Code",
      "Settings",
      "Import",
      "EDI",
    ]);
  });

  describe("banned items never reappear", () => {
    it.each(["user", "admin", "exec", "ops", "finance", "sales", "legal"])(
      "%s role sidebar has no banned labels",
      (role) => {
        const labels = labelsOf(role);
        for (const banned of BANNED_LABELS) {
          expect(labels).not.toContain(banned);
        }
      },
    );

    it.each(["user", "admin", "exec", "ops", "finance", "sales", "legal"])(
      "%s role has no banned section labels",
      (role) => {
        const sections = getMenuGroups(role).map((g) => g.label);
        for (const banned of BANNED_SECTION_LABELS) {
          expect(sections).not.toContain(banned);
        }
      },
    );
  });

  describe("role gating", () => {
    it("basic user sees Command Center, People, Tools only (no Sales/Finance/Operations)", () => {
      const groups = getMenuGroups("user");
      expect(groups.map((g) => g.label)).toEqual([
        "Command Center",
        "People",
        "Tools",
      ]);
    });

    it("ops user sees Sales and Operations, not Finance", () => {
      const labels = getMenuGroups("ops").map((g) => g.label);
      expect(labels).toContain("Sales");
      expect(labels).toContain("Operations");
      expect(labels).not.toContain("Finance");
    });

    it("ops user Sales section has Orders only (no CRM / Marketing)", () => {
      const sales = getMenuGroups("ops").find((g) => g.label === "Sales")!;
      expect(sales.items.map((i) => i.label)).toEqual(["Orders"]);
    });

    it("sales user sees Sales but not Finance or Operations", () => {
      const labels = getMenuGroups("sales").map((g) => g.label);
      expect(labels).toContain("Sales");
      expect(labels).not.toContain("Finance");
      expect(labels).not.toContain("Operations");
    });

    it("sales user Sales section has Orders, CRM, Marketing", () => {
      const sales = getMenuGroups("sales").find((g) => g.label === "Sales")!;
      expect(sales.items.map((i) => i.label)).toEqual([
        "Orders",
        "CRM",
        "Marketing",
      ]);
    });

    it("finance user sees Finance but not Sales or Operations", () => {
      const labels = getMenuGroups("finance").map((g) => g.label);
      expect(labels).toContain("Finance");
      expect(labels).not.toContain("Sales");
      expect(labels).not.toContain("Operations");
    });

    it("Recipes is admin/ops only (exec does NOT see it — trade secrets)", () => {
      const opsItems = (role: string) =>
        getMenuGroups(role).find((g) => g.label === "Operations")?.items.map((i) => i.label) ?? [];
      expect(opsItems("admin")).toContain("Recipes");
      expect(opsItems("ops")).toContain("Recipes");
      expect(opsItems("exec")).not.toContain("Recipes");
    });

    it("Tools always includes SOPs for all roles", () => {
      for (const role of ["user", "admin", "exec", "ops", "finance", "sales", "legal"]) {
        const tools = getMenuGroups(role).find((g) => g.label === "Tools")!;
        expect(tools.items.map((i) => i.label)).toContain("SOPs");
      }
    });

    it("Code and Settings are admin-only in Tools", () => {
      const userTools = getMenuGroups("user").find((g) => g.label === "Tools")!.items.map((i) => i.label);
      expect(userTools).not.toContain("Code");
      expect(userTools).not.toContain("Settings");

      const adminTools = getMenuGroups("admin").find((g) => g.label === "Tools")!.items.map((i) => i.label);
      expect(adminTools).toContain("Code");
      expect(adminTools).toContain("Settings");
    });

    it("Import is admin/ops only in Tools", () => {
      expect(getMenuGroups("user").find((g) => g.label === "Tools")!.items.map((i) => i.label)).not.toContain("Import");
      expect(getMenuGroups("sales").find((g) => g.label === "Tools")!.items.map((i) => i.label)).not.toContain("Import");
      expect(getMenuGroups("admin").find((g) => g.label === "Tools")!.items.map((i) => i.label)).toContain("Import");
      expect(getMenuGroups("ops").find((g) => g.label === "Tools")!.items.map((i) => i.label)).toContain("Import");
    });

    it("EDI is admin/ops only in Tools", () => {
      expect(getMenuGroups("user").find((g) => g.label === "Tools")!.items.map((i) => i.label)).not.toContain("EDI");
      expect(getMenuGroups("finance").find((g) => g.label === "Tools")!.items.map((i) => i.label)).not.toContain("EDI");
      expect(getMenuGroups("admin").find((g) => g.label === "Tools")!.items.map((i) => i.label)).toContain("EDI");
      expect(getMenuGroups("ops").find((g) => g.label === "Tools")!.items.map((i) => i.label)).toContain("EDI");
    });

    it("legal user sees Legal in People", () => {
      const people = getMenuGroups("legal").find((g) => g.label === "People")!;
      expect(people.items.map((i) => i.label)).toContain("Legal");
    });

    it("non-legal user does not see Legal in People", () => {
      const people = getMenuGroups("user").find((g) => g.label === "People")!;
      expect(people.items.map((i) => i.label)).not.toContain("Legal");
    });
  });
});
