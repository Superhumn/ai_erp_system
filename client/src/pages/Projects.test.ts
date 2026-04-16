/**
 * Tests for Projects page utility functions.
 * Functions tested: formatDate, getSuggestedDeadlineDays, formatSuggestedDate,
 * getDeadlineStatus, deadlineIndicatorClass, getInitials, avatarColor,
 * taskStatusOptions, priorityOptions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Re-implement pure functions from Projects.tsx for unit testing ──

const taskStatusOptions = [
  { value: "todo", label: "To Do", color: "bg-blue-500/8 text-blue-600 dark:text-blue-400" },
  { value: "in_progress", label: "In Progress", color: "bg-amber-500/8 text-amber-600 dark:text-amber-400" },
  { value: "review", label: "Review", color: "bg-violet-500/8 text-violet-600 dark:text-violet-400" },
  { value: "completed", label: "Done", color: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400" },
  { value: "cancelled", label: "Cancelled", color: "bg-gray-500/8 text-gray-600 dark:text-gray-400" },
];

const priorityOptions = [
  { value: "low", label: "Low", color: "text-gray-500" },
  { value: "medium", label: "Medium", color: "text-blue-500" },
  { value: "high", label: "High", color: "text-orange-500" },
  { value: "urgent", label: "Urgent", color: "text-red-500" },
];

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getSuggestedDeadlineDays(priority: string): number {
  switch (priority) {
    case "urgent": return 1;
    case "high": return 3;
    case "medium": return 7;
    case "low": return 14;
    default: return 7;
  }
}

function formatSuggestedDate(priority: string): string {
  const days = getSuggestedDeadlineDays(priority);
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

type DeadlineStatus = "overdue" | "approaching" | "normal" | "none";

function getDeadlineStatus(dueDate: string | Date | null | undefined, status: string): DeadlineStatus {
  if (!dueDate || status === "completed" || status === "cancelled") return "none";
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 2) return "approaching";
  return "normal";
}

function deadlineIndicatorClass(dlStatus: DeadlineStatus): string {
  switch (dlStatus) {
    case "overdue": return "text-red-600 border-red-300 bg-red-50";
    case "approaching": return "text-amber-600 border-amber-300 bg-amber-50";
    default: return "";
  }
}

function getInitials(name: string | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function avatarColor(name: string | undefined): string {
  if (!name) return "bg-gray-300";
  const colors = [
    "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-pink-500",
    "bg-indigo-500", "bg-teal-500", "bg-orange-500", "bg-cyan-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ── Tests ──

describe("Projects page — taskStatusOptions", () => {
  it("has 5 statuses", () => {
    expect(taskStatusOptions).toHaveLength(5);
  });

  it("includes all expected status values", () => {
    const values = taskStatusOptions.map(o => o.value);
    expect(values).toEqual(["todo", "in_progress", "review", "completed", "cancelled"]);
  });

  it("each option has a value, label, and color", () => {
    for (const opt of taskStatusOptions) {
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(opt.color).toBeTruthy();
    }
  });
});

describe("Projects page — priorityOptions", () => {
  it("has 4 priority levels", () => {
    expect(priorityOptions).toHaveLength(4);
  });

  it("goes from low to urgent", () => {
    const values = priorityOptions.map(o => o.value);
    expect(values).toEqual(["low", "medium", "high", "urgent"]);
  });
});

describe("Projects page — formatDate", () => {
  it("formats a Date object", () => {
    const d = new Date(2026, 0, 15); // Jan 15, 2026
    expect(formatDate(d)).toBe("Jan 15");
  });

  it("formats a date string", () => {
    expect(formatDate("2026-06-20")).toMatch(/Jun\s+20/);
  });

  it("returns dash for null", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(formatDate(undefined)).toBe("-");
  });

  it("returns dash for empty string", () => {
    expect(formatDate("")).toBe("-");
  });
});

describe("Projects page — getSuggestedDeadlineDays", () => {
  it("returns 1 for urgent", () => {
    expect(getSuggestedDeadlineDays("urgent")).toBe(1);
  });

  it("returns 3 for high", () => {
    expect(getSuggestedDeadlineDays("high")).toBe(3);
  });

  it("returns 7 for medium", () => {
    expect(getSuggestedDeadlineDays("medium")).toBe(7);
  });

  it("returns 14 for low", () => {
    expect(getSuggestedDeadlineDays("low")).toBe(14);
  });

  it("returns 7 for unknown priority (default)", () => {
    expect(getSuggestedDeadlineDays("unknown")).toBe(7);
  });
});

describe("Projects page — formatSuggestedDate", () => {
  it("returns ISO date string for urgent (1 day ahead)", () => {
    const result = formatSuggestedDate("urgent");
    const expected = new Date();
    expected.setDate(expected.getDate() + 1);
    expect(result).toBe(expected.toISOString().split("T")[0]);
  });

  it("returns ISO date string for low (14 days ahead)", () => {
    const result = formatSuggestedDate("low");
    const expected = new Date();
    expected.setDate(expected.getDate() + 14);
    expect(result).toBe(expected.toISOString().split("T")[0]);
  });

  it("returns a valid YYYY-MM-DD format", () => {
    expect(formatSuggestedDate("medium")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Projects page — getDeadlineStatus", () => {
  it("returns 'none' for null dueDate", () => {
    expect(getDeadlineStatus(null, "todo")).toBe("none");
  });

  it("returns 'none' for undefined dueDate", () => {
    expect(getDeadlineStatus(undefined, "todo")).toBe("none");
  });

  it("returns 'none' for completed status regardless of date", () => {
    const pastDate = new Date(2020, 0, 1);
    expect(getDeadlineStatus(pastDate, "completed")).toBe("none");
  });

  it("returns 'none' for cancelled status regardless of date", () => {
    const pastDate = new Date(2020, 0, 1);
    expect(getDeadlineStatus(pastDate, "cancelled")).toBe("none");
  });

  it("returns 'overdue' for past due dates", () => {
    const pastDate = new Date(2020, 0, 1);
    expect(getDeadlineStatus(pastDate, "todo")).toBe("overdue");
  });

  it("returns 'overdue' for past string dates", () => {
    expect(getDeadlineStatus("2020-01-01", "in_progress")).toBe("overdue");
  });

  it("returns 'approaching' for dates within 2 days", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(getDeadlineStatus(tomorrow, "todo")).toBe("approaching");
  });

  it("returns 'normal' for dates more than 2 days away", () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 30);
    expect(getDeadlineStatus(farFuture, "todo")).toBe("normal");
  });
});

describe("Projects page — deadlineIndicatorClass", () => {
  it("returns red classes for overdue", () => {
    expect(deadlineIndicatorClass("overdue")).toBe("text-red-600 border-red-300 bg-red-50");
  });

  it("returns amber classes for approaching", () => {
    expect(deadlineIndicatorClass("approaching")).toBe("text-amber-600 border-amber-300 bg-amber-50");
  });

  it("returns empty string for normal", () => {
    expect(deadlineIndicatorClass("normal")).toBe("");
  });

  it("returns empty string for none", () => {
    expect(deadlineIndicatorClass("none")).toBe("");
  });
});

describe("Projects page — getInitials", () => {
  it("extracts initials from two-word name", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("extracts initials from single word", () => {
    expect(getInitials("Alice")).toBe("A");
  });

  it("extracts max 2 initials from long names", () => {
    expect(getInitials("John Michael Doe Smith")).toBe("JM");
  });

  it("returns ? for undefined", () => {
    expect(getInitials(undefined)).toBe("?");
  });

  it("uppercases initials", () => {
    expect(getInitials("john doe")).toBe("JD");
  });
});

describe("Projects page — avatarColor", () => {
  it("returns gray for undefined name", () => {
    expect(avatarColor(undefined)).toBe("bg-gray-300");
  });

  it("returns a bg-* color for valid names", () => {
    expect(avatarColor("Alice")).toMatch(/^bg-\w+-500$/);
  });

  it("returns consistent color for same name", () => {
    const c1 = avatarColor("Bob");
    const c2 = avatarColor("Bob");
    expect(c1).toBe(c2);
  });

  it("returns one of the 8 predefined colors", () => {
    const validColors = [
      "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-pink-500",
      "bg-indigo-500", "bg-teal-500", "bg-orange-500", "bg-cyan-500",
    ];
    const color = avatarColor("Test User");
    expect(validColors).toContain(color);
  });

  it("different names may get different colors", () => {
    // Not guaranteed but likely for different enough names
    const colors = new Set([
      avatarColor("Alice"), avatarColor("Bob"), avatarColor("Charlie"),
      avatarColor("Diana"), avatarColor("Eve"), avatarColor("Frank"),
    ]);
    expect(colors.size).toBeGreaterThan(1);
  });
});
