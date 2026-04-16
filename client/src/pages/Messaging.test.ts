/**
 * Tests for Messaging page utility functions.
 * Functions tested: truncate, channelBadge variants, messageStatusIcon variants,
 * filteredContacts logic, lastMessageMap logic
 */
import { describe, it, expect } from "vitest";

// ── Re-implement pure functions from Messaging.tsx ──

function truncate(text: string, maxLen: number) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

// Channel badge variant lookup
const channelVariants: Record<string, { label: string; className: string }> = {
  whatsapp: { label: "WhatsApp", className: "bg-green-100 text-green-700 border-green-200" },
  email: { label: "Email", className: "bg-blue-100 text-blue-700 border-blue-200" },
  phone: { label: "Phone", className: "bg-orange-100 text-orange-700 border-orange-200" },
  sms: { label: "SMS", className: "bg-purple-100 text-purple-700 border-purple-200" },
};

function getChannelBadgeInfo(channel?: string): { label: string; className: string } {
  return channelVariants[channel || ""] || { label: channel || "Unknown", className: "" };
}

// Contact filtering logic
function filterContacts(
  contacts: Array<{ fullName?: string; firstName?: string; organization?: string; email?: string; phone?: string; whatsappNumber?: string }>,
  search: string,
): typeof contacts {
  if (!search) return contacts;
  const q = search.toLowerCase();
  return contacts.filter((c) => {
    const name = (c.fullName || c.firstName || "").toLowerCase();
    const org = (c.organization || "").toLowerCase();
    const email = (c.email || "").toLowerCase();
    const phone = (c.phone || c.whatsappNumber || "").toLowerCase();
    return name.includes(q) || org.includes(q) || email.includes(q) || phone.includes(q);
  });
}

// lastMessageMap logic
function buildLastMessageMap(conversations: Array<{ contactId?: number }>): Map<number, any> {
  const map = new Map<number, any>();
  for (const conv of conversations) {
    if (conv.contactId && !map.has(conv.contactId)) {
      map.set(conv.contactId, conv);
    }
  }
  return map;
}

// ── Tests ──

describe("Messaging page — truncate", () => {
  it("returns text unchanged if shorter than maxLen", () => {
    expect(truncate("Hello", 10)).toBe("Hello");
  });

  it("truncates text longer than maxLen with ellipsis", () => {
    expect(truncate("Hello, World!", 5)).toBe("Hello...");
  });

  it("returns empty string for empty input", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("returns text unchanged if exactly at maxLen", () => {
    expect(truncate("12345", 5)).toBe("12345");
  });

  it("truncates at the exact maxLen position", () => {
    expect(truncate("abcdef", 3)).toBe("abc...");
  });

  it("handles maxLen of 0", () => {
    expect(truncate("abc", 0)).toBe("...");
  });

  it("handles maxLen of 1", () => {
    expect(truncate("abc", 1)).toBe("a...");
  });
});

describe("Messaging page — channelBadge variants", () => {
  it("returns WhatsApp info for whatsapp channel", () => {
    const info = getChannelBadgeInfo("whatsapp");
    expect(info.label).toBe("WhatsApp");
    expect(info.className).toContain("green");
  });

  it("returns Email info for email channel", () => {
    const info = getChannelBadgeInfo("email");
    expect(info.label).toBe("Email");
    expect(info.className).toContain("blue");
  });

  it("returns Phone info for phone channel", () => {
    const info = getChannelBadgeInfo("phone");
    expect(info.label).toBe("Phone");
    expect(info.className).toContain("orange");
  });

  it("returns SMS info for sms channel", () => {
    const info = getChannelBadgeInfo("sms");
    expect(info.label).toBe("SMS");
    expect(info.className).toContain("purple");
  });

  it("returns Unknown for undefined channel", () => {
    const info = getChannelBadgeInfo(undefined);
    expect(info.label).toBe("Unknown");
    expect(info.className).toBe("");
  });

  it("returns channel name for unrecognized channel", () => {
    const info = getChannelBadgeInfo("telegram");
    expect(info.label).toBe("telegram");
    expect(info.className).toBe("");
  });
});

describe("Messaging page — filterContacts", () => {
  const contacts = [
    { fullName: "Alice Smith", email: "alice@test.com", organization: "Acme Corp", phone: "+1234" },
    { fullName: "Bob Jones", email: "bob@test.com", organization: "Widget Inc", phone: "+5678" },
    { firstName: "Charlie", email: "charlie@mega.com", organization: "Mega Ltd" },
  ];

  it("returns all contacts when search is empty", () => {
    expect(filterContacts(contacts, "")).toEqual(contacts);
  });

  it("filters by full name", () => {
    const result = filterContacts(contacts, "alice");
    expect(result).toHaveLength(1);
    expect(result[0].fullName).toBe("Alice Smith");
  });

  it("filters by organization", () => {
    const result = filterContacts(contacts, "widget");
    expect(result).toHaveLength(1);
    expect(result[0].fullName).toBe("Bob Jones");
  });

  it("filters by email", () => {
    const result = filterContacts(contacts, "mega.com");
    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe("Charlie");
  });

  it("filters by phone", () => {
    const result = filterContacts(contacts, "5678");
    expect(result).toHaveLength(1);
  });

  it("is case-insensitive", () => {
    const result = filterContacts(contacts, "ALICE");
    expect(result).toHaveLength(1);
  });

  it("returns empty for no match", () => {
    expect(filterContacts(contacts, "zzz")).toHaveLength(0);
  });

  it("falls back to firstName when fullName is absent", () => {
    const result = filterContacts(contacts, "charlie");
    expect(result).toHaveLength(1);
  });
});

describe("Messaging page — buildLastMessageMap", () => {
  it("builds map from conversations", () => {
    const convos = [
      { contactId: 1, message: "Hi" },
      { contactId: 2, message: "Hello" },
    ];
    const map = buildLastMessageMap(convos);
    expect(map.size).toBe(2);
    expect(map.get(1)).toEqual(convos[0]);
    expect(map.get(2)).toEqual(convos[1]);
  });

  it("keeps first conversation per contact (dedup)", () => {
    const convos = [
      { contactId: 1, message: "First" },
      { contactId: 1, message: "Second" },
    ];
    const map = buildLastMessageMap(convos);
    expect(map.size).toBe(1);
    expect(map.get(1)!.message).toBe("First");
  });

  it("skips entries without contactId", () => {
    const convos = [
      { contactId: undefined },
      { contactId: 1, message: "Valid" },
    ];
    const map = buildLastMessageMap(convos);
    expect(map.size).toBe(1);
  });

  it("returns empty map for empty array", () => {
    expect(buildLastMessageMap([]).size).toBe(0);
  });
});
