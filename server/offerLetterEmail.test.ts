import { describe, expect, it } from "vitest";
import { escapeHtml, formatMoney, formatOfferDate, renderOfferLetterEmail, type OfferLetterEmailInput } from "./offerLetterEmail";

const letter = (overrides: Partial<OfferLetterEmailInput> = {}): OfferLetterEmailInput => ({
  candidateName: "Dana Employee",
  candidateEmail: "dana@example.com",
  position: "Operations Analyst",
  department: "Operations",
  startDate: new Date("2026-10-01"),
  salary: "85000.00",
  salaryPeriod: "annual",
  employmentType: "full_time",
  reportingTo: "Morgan Manager",
  location: "Remote",
  benefits: "Health, dental\n401k match",
  expiresAt: new Date("2026-10-15"),
  ...overrides,
});

describe("formatOfferDate", () => {
  it("formats a midnight-UTC timestamp as the stored calendar day", () => {
    expect(formatOfferDate(new Date("2026-10-01"))).toBe("October 1, 2026");
    expect(formatOfferDate(new Date("2026-10-01T00:00:00.000Z"))).toBe("October 1, 2026");
  });

  it("reads a bare YYYY-MM-DD string without shifting it", () => {
    expect(formatOfferDate("2026-01-01")).toBe("January 1, 2026");
  });

  it("returns undefined for empty or invalid input", () => {
    expect(formatOfferDate(null)).toBeUndefined();
    expect(formatOfferDate("")).toBeUndefined();
    expect(formatOfferDate("not a date")).toBeUndefined();
  });
});

describe("formatMoney", () => {
  it("drops cents on whole amounts and keeps them otherwise", () => {
    expect(formatMoney("85000.00")).toBe("$85,000");
    expect(formatMoney("42.5")).toBe("$42.50");
    expect(formatMoney(1234.56, "EUR", "en-US")).toBe("€1,234.56");
  });

  it("falls back to code + number for an unknown currency", () => {
    expect(formatMoney("100", "NOPE")).toBe("NOPE 100");
  });

  it("returns undefined for blank / non-numeric values", () => {
    expect(formatMoney(null)).toBeUndefined();
    expect(formatMoney("abc")).toBeUndefined();
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("renderOfferLetterEmail", () => {
  it("renders every term in subject, HTML and text", () => {
    const out = renderOfferLetterEmail(letter(), { name: "Superhumn Inc", functionalCurrency: "USD" });

    expect(out.subject).toBe("Offer of employment: Operations Analyst at Superhumn Inc");
    for (const body of [out.html, out.text]) {
      expect(body).toContain("Dana Employee");
      expect(body).toContain("Operations Analyst");
      expect(body).toContain("Operations");
      expect(body).toContain("Morgan Manager");
      expect(body).toContain("Remote");
      expect(body).toContain("Full-time");
      expect(body).toContain("October 1, 2026");
      expect(body).toContain("$85,000 per year");
      expect(body).toContain("401k match");
      expect(body).toContain("Please respond by October 15, 2026.");
      expect(body).toContain("reply to this email");
    }
    expect(out.text).toContain("Compensation: $85,000 per year");
    expect(out.text).toContain("Start date: October 1, 2026");
    expect(out.html).toContain("Health, dental<br>401k match");
  });

  it("uses the company's currency and the pay frequency", () => {
    const out = renderOfferLetterEmail(letter({ salary: "45.5", salaryPeriod: "hourly" }), { name: "Acme GmbH", functionalCurrency: "EUR" });
    expect(out.text).toContain("Compensation: €45.50 per hour");
    const monthly = renderOfferLetterEmail(letter({ salary: 7000, salaryPeriod: "monthly" }));
    expect(monthly.text).toContain("Compensation: $7,000 per month");
  });

  it("includes bonus and equity with vesting when present", () => {
    const out = renderOfferLetterEmail(letter({ bonus: "5000", equityShares: "10000.0000", equityType: "ISO", vestingMonths: 48, cliffMonths: 12 }));
    expect(out.text).toContain("Bonus: $5,000");
    expect(out.text).toContain("Equity: 10,000 shares (ISO), vesting over 48 months with a 12-month cliff");
  });

  it("omits optional terms that are blank", () => {
    const out = renderOfferLetterEmail({ candidateName: "Sam", position: "Intern" });
    expect(out.subject).toBe("Offer of employment: Intern");
    expect(out.text).not.toMatch(/Start date|Compensation|Department|Benefits|Please respond by/);
    expect(out.text).toContain("Sincerely,\nthe team");
  });

  it("escapes user-supplied text in the HTML body", () => {
    const out = renderOfferLetterEmail(
      letter({
        candidateName: `<script>alert("x")</script>`,
        position: "Eng & <b>Ops</b>",
        benefits: `<img src=x onerror=alert(1)>`,
        letterContent: `# Welcome\n<iframe src="evil"></iframe>`,
      }),
      { name: `Acme <Corp>` },
      { message: `<a href="javascript:alert(1)">click</a>`, senderName: "<Admin>" },
    );
    expect(out.html).not.toMatch(/<script|<img|<iframe|<b>Ops|<a href="javascript|<Admin>|<Corp>/);
    expect(out.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(out.html).toContain("Eng &amp; &lt;b&gt;Ops&lt;/b&gt;");
    expect(out.html).toContain("&lt;iframe src=&quot;evil&quot;&gt;&lt;/iframe&gt;");
    // The plain-text part carries the raw text.
    expect(out.text).toContain(`<script>alert("x")</script>`);
  });

  it("keeps subject a single line", () => {
    const out = renderOfferLetterEmail(letter({ position: "Analyst\r\nBcc: victim@example.com" }));
    expect(out.subject).toBe("Offer of employment: Analyst Bcc: victim@example.com");
    expect(out.subject).not.toMatch(/[\r\n]/);
  });

  it("includes the sender's note and the full letter content", () => {
    const out = renderOfferLetterEmail(letter({ letterContent: "Full letter body here." }), null, { message: "Looking forward to working with you!", senderName: "Admin User" });
    expect(out.text).toContain("Looking forward to working with you!");
    expect(out.text).toContain("Offer letter:\n\nFull letter body here.");
    expect(out.html).toContain("Full letter body here.");
    expect(out.text).toContain("Sincerely,\nAdmin User\nthe team");
  });

  it("renders an accept link only for http(s) URLs", () => {
    const withLink = renderOfferLetterEmail(letter(), null, { acceptUrl: "https://app.example.com/offers/abc" });
    expect(withLink.html).toContain('href="https://app.example.com/offers/abc"');
    expect(withLink.text).toContain("Accept the offer: https://app.example.com/offers/abc");
    expect(withLink.text).not.toContain("reply to this email confirming");

    const bad = renderOfferLetterEmail(letter(), null, { acceptUrl: "javascript:alert(1)" });
    expect(bad.html).not.toContain("javascript:");
    expect(bad.text).toContain("reply to this email");
  });

  it("never renders the internal notes column", () => {
    const row = { ...letter(), notes: "Candidate asked for 95k; floor is 80k" } as OfferLetterEmailInput;
    const out = renderOfferLetterEmail(row);
    expect(out.html).not.toContain("floor is 80k");
    expect(out.text).not.toContain("floor is 80k");
  });
});
