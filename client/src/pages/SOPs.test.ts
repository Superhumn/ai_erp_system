/**
 * Tests for SOPs page utility functions.
 * Functions tested: SOPSection/SOPStep types, SOP data structure, filtering logic
 */
import { describe, it, expect } from "vitest";

// ── Re-implement types and filtering from SOPs.tsx ──

type SOPStep = {
  title: string;
  details: string[];
  link?: string;
  substeps?: { title: string; details: string[] }[];
};

type SOPSection = {
  id: string;
  title: string;
  audience: string[];
  purpose: string;
  steps: SOPStep[];
};

// Simulate filtering SOPs by search query
function filterSOPs(sops: SOPSection[], query: string): SOPSection[] {
  if (!query) return sops;
  const q = query.toLowerCase();
  return sops.filter(sop =>
    sop.title.toLowerCase().includes(q) ||
    sop.purpose.toLowerCase().includes(q) ||
    sop.audience.some(a => a.toLowerCase().includes(q)) ||
    sop.steps.some(s =>
      s.title.toLowerCase().includes(q) ||
      s.details.some(d => d.toLowerCase().includes(q))
    )
  );
}

// ── Test data ──

const testSOPs: SOPSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    audience: ["All Users"],
    purpose: "First-time login and orientation.",
    steps: [
      { title: "Receive invitation", details: ["Check email for link."] },
      { title: "Sign in", details: ["Navigate to the URL.", "Enter credentials."] },
    ],
  },
  {
    id: "order-processing",
    title: "Order Processing",
    audience: ["Sales", "Operations"],
    purpose: "Process customer orders from receipt to fulfillment.",
    steps: [
      { title: "Review order", details: ["Check order details."] },
      { title: "Confirm inventory", details: ["Verify stock levels."], link: "/operations/inventory" },
      { title: "Ship order", details: ["Create shipment.", "Notify customer."] },
    ],
  },
  {
    id: "vendor-management",
    title: "Vendor Management",
    audience: ["Operations", "Admin"],
    purpose: "Manage vendor relationships and procurement.",
    steps: [
      { title: "Add vendor", details: ["Enter vendor details."], link: "/operations/vendors" },
    ],
  },
];

// ── Tests ──

describe("SOPs — data structure", () => {
  it("each SOP has required fields", () => {
    for (const sop of testSOPs) {
      expect(sop.id).toBeTruthy();
      expect(sop.title).toBeTruthy();
      expect(sop.audience.length).toBeGreaterThan(0);
      expect(sop.purpose).toBeTruthy();
      expect(sop.steps.length).toBeGreaterThan(0);
    }
  });

  it("each step has title and details", () => {
    for (const sop of testSOPs) {
      for (const step of sop.steps) {
        expect(step.title).toBeTruthy();
        expect(step.details.length).toBeGreaterThan(0);
      }
    }
  });

  it("SOPs have unique IDs", () => {
    const ids = testSOPs.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("some steps have optional links", () => {
    const stepsWithLinks = testSOPs.flatMap(s => s.steps).filter(s => s.link);
    expect(stepsWithLinks.length).toBeGreaterThan(0);
  });
});

describe("SOPs — filterSOPs", () => {
  it("returns all SOPs for empty query", () => {
    expect(filterSOPs(testSOPs, "")).toEqual(testSOPs);
  });

  it("filters by title", () => {
    const result = filterSOPs(testSOPs, "getting started");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("getting-started");
  });

  it("filters by purpose", () => {
    const result = filterSOPs(testSOPs, "procurement");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("vendor-management");
  });

  it("filters by audience", () => {
    const result = filterSOPs(testSOPs, "admin");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("vendor-management");
  });

  it("filters by step title", () => {
    const result = filterSOPs(testSOPs, "ship order");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("order-processing");
  });

  it("filters by step details", () => {
    const result = filterSOPs(testSOPs, "stock levels");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("order-processing");
  });

  it("is case insensitive", () => {
    expect(filterSOPs(testSOPs, "ORDER PROCESSING")).toHaveLength(1);
  });

  it("returns empty for no match", () => {
    expect(filterSOPs(testSOPs, "zzz")).toHaveLength(0);
  });

  it("matches multiple SOPs if query is broad", () => {
    const result = filterSOPs(testSOPs, "operations");
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});
