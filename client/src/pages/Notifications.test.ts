/**
 * Tests for Notifications page utility functions.
 * Functions tested: getIcon type mapping, unreadCount computation
 */
import { describe, it, expect } from "vitest";

// ── Re-implement from Notifications.tsx ──

function getIconType(type: string): string {
  switch (type) {
    case "warning": return "amber";
    case "error": return "red";
    case "success": return "green";
    default: return "blue";
  }
}

function computeUnreadCount(notifications: Array<{ isRead: boolean }> | undefined): number {
  return notifications?.filter(n => !n.isRead).length || 0;
}

// ── Tests ──

describe("Notifications — getIconType", () => {
  it("returns amber for warning", () => {
    expect(getIconType("warning")).toBe("amber");
  });

  it("returns red for error", () => {
    expect(getIconType("error")).toBe("red");
  });

  it("returns green for success", () => {
    expect(getIconType("success")).toBe("green");
  });

  it("returns blue for info (default)", () => {
    expect(getIconType("info")).toBe("blue");
  });

  it("returns blue for unknown type", () => {
    expect(getIconType("unknown")).toBe("blue");
  });
});

describe("Notifications — computeUnreadCount", () => {
  it("returns 0 for undefined", () => {
    expect(computeUnreadCount(undefined)).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(computeUnreadCount([])).toBe(0);
  });

  it("returns 0 when all are read", () => {
    const notifs = [{ isRead: true }, { isRead: true }];
    expect(computeUnreadCount(notifs)).toBe(0);
  });

  it("counts unread notifications", () => {
    const notifs = [
      { isRead: false },
      { isRead: true },
      { isRead: false },
    ];
    expect(computeUnreadCount(notifs)).toBe(2);
  });

  it("counts all unread when none are read", () => {
    const notifs = [{ isRead: false }, { isRead: false }, { isRead: false }];
    expect(computeUnreadCount(notifs)).toBe(3);
  });
});
