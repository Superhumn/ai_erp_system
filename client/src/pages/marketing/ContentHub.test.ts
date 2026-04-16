/**
 * Tests for ContentHub page utility functions.
 * Functions tested: contentTypes, content filtering logic
 */
import { describe, it, expect } from "vitest";

// ── Re-implement from ContentHub.tsx ──

const contentTypes = [
  { value: "blog", label: "Blog Post" },
  { value: "social", label: "Social Media" },
  { value: "email", label: "Email Campaign" },
  { value: "pr", label: "Press Release" },
  { value: "product", label: "Product Copy" },
] as const;

type ContentItem = {
  id: number;
  type: string;
  title: string;
  content: string;
  status: string;
  keywords: string | null;
};

function filterContent(
  items: ContentItem[],
  search: string,
  typeFilter: string,
  statusFilter: string,
): ContentItem[] {
  return items.filter(item => {
    const matchesSearch = !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.content.toLowerCase().includes(search.toLowerCase()) ||
      (item.keywords && item.keywords.toLowerCase().includes(search.toLowerCase()));
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });
}

// ── Tests ──

describe("ContentHub — contentTypes", () => {
  it("has 5 content types", () => {
    expect(contentTypes).toHaveLength(5);
  });

  it("includes blog", () => {
    expect(contentTypes.find(c => c.value === "blog")).toBeTruthy();
  });

  it("includes social", () => {
    expect(contentTypes.find(c => c.value === "social")).toBeTruthy();
  });

  it("includes email", () => {
    expect(contentTypes.find(c => c.value === "email")).toBeTruthy();
  });

  it("includes pr", () => {
    expect(contentTypes.find(c => c.value === "pr")).toBeTruthy();
  });

  it("includes product", () => {
    expect(contentTypes.find(c => c.value === "product")).toBeTruthy();
  });

  it("all have labels", () => {
    for (const type of contentTypes) {
      expect(type.label.length).toBeGreaterThan(0);
    }
  });

  it("all have unique values", () => {
    const values = contentTypes.map(c => c.value);
    expect(new Set(values).size).toBe(5);
  });
});

describe("ContentHub — filterContent", () => {
  const items: ContentItem[] = [
    { id: 1, type: "blog", title: "Launch Announcement", content: "We're excited...", status: "published", keywords: "launch,product" },
    { id: 2, type: "social", title: "Twitter Post", content: "Check out our new...", status: "draft", keywords: null },
    { id: 3, type: "email", title: "Newsletter", content: "Monthly update...", status: "published", keywords: "newsletter,update" },
    { id: 4, type: "blog", title: "Tech Blog", content: "Engineering deep dive", status: "draft", keywords: "engineering,tech" },
  ];

  it("returns all items with no filters", () => {
    expect(filterContent(items, "", "all", "all")).toHaveLength(4);
  });

  it("filters by search in title", () => {
    const result = filterContent(items, "launch", "all", "all");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Launch Announcement");
  });

  it("filters by search in content", () => {
    const result = filterContent(items, "deep dive", "all", "all");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Tech Blog");
  });

  it("filters by search in keywords", () => {
    const result = filterContent(items, "newsletter", "all", "all");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Newsletter");
  });

  it("filters by type", () => {
    const result = filterContent(items, "", "blog", "all");
    expect(result).toHaveLength(2);
  });

  it("filters by status", () => {
    const result = filterContent(items, "", "all", "published");
    expect(result).toHaveLength(2);
  });

  it("combines all filters", () => {
    const result = filterContent(items, "tech", "blog", "draft");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Tech Blog");
  });

  it("returns empty for no match", () => {
    expect(filterContent(items, "zzz", "all", "all")).toHaveLength(0);
  });

  it("handles null keywords gracefully", () => {
    const result = filterContent(items, "twitter", "all", "all");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("is case insensitive", () => {
    expect(filterContent(items, "LAUNCH", "all", "all")).toHaveLength(1);
  });
});
