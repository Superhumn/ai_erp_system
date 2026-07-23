import { describe, it, expect } from "vitest";
import { extractEmailBody, formatInboundSummary } from "./aiAgentService";

describe("extractEmailBody", () => {
  it("prefers plain text when present", () => {
    expect(extractEmailBody({ bodyText: "  hello there  ", bodyHtml: "<p>ignored</p>" })).toBe("hello there");
  });

  it("falls back to stripped HTML when text is empty", () => {
    expect(extractEmailBody({ bodyText: "", bodyHtml: "<p>Hi <b>Acme</b></p>" })).toBe("Hi Acme");
  });

  it("returns empty string when both are missing", () => {
    expect(extractEmailBody({ bodyText: null, bodyHtml: null })).toBe("");
  });
});

describe("formatInboundSummary", () => {
  it("combines name + email and truncates the snippet to 200 chars", () => {
    const summary = formatInboundSummary({
      id: 7,
      fromName: "Acme AP",
      fromEmail: "ap@acme.com",
      subject: "Invoice 1234 overdue",
      bodyText: "x".repeat(500),
      receivedAt: null,
      category: "invoice",
      priority: "high",
    });
    expect(summary.id).toBe(7);
    expect(summary.from).toBe("Acme AP <ap@acme.com>");
    expect(summary.subject).toBe("Invoice 1234 overdue");
    expect(summary.snippet).toHaveLength(200);
  });

  it("handles a missing sender name and empty subject", () => {
    const summary = formatInboundSummary({
      id: 8,
      fromName: null,
      fromEmail: "noreply@x.com",
      subject: null,
      bodyText: "body",
    });
    expect(summary.from).toBe("noreply@x.com");
    expect(summary.subject).toBe("(no subject)");
  });
});
