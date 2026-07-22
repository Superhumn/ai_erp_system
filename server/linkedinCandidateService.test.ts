import { describe, it, expect } from "vitest";
import { normalizeLinkedInUrl, nameFromSlug } from "./linkedinCandidateService";

describe("normalizeLinkedInUrl", () => {
  it("accepts a canonical profile URL", () => {
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/jane-doe")).toBe(
      "https://www.linkedin.com/in/jane-doe"
    );
  });

  it("upgrades http to https", () => {
    expect(normalizeLinkedInUrl("http://www.linkedin.com/in/jane-doe")).toBe(
      "https://www.linkedin.com/in/jane-doe"
    );
  });

  it("strips query string and fragment", () => {
    expect(
      normalizeLinkedInUrl(
        "https://www.linkedin.com/in/jane-doe?trk=abc&foo=bar#section"
      )
    ).toBe("https://www.linkedin.com/in/jane-doe");
  });

  it("drops a trailing slash", () => {
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/jane-doe/")).toBe(
      "https://www.linkedin.com/in/jane-doe"
    );
  });

  it("accepts regional subdomains", () => {
    expect(normalizeLinkedInUrl("https://uk.linkedin.com/in/jane-doe")).toBe(
      "https://uk.linkedin.com/in/jane-doe"
    );
  });

  it("accepts the apex linkedin.com host", () => {
    expect(normalizeLinkedInUrl("https://linkedin.com/in/jane-doe")).toBe(
      "https://linkedin.com/in/jane-doe"
    );
  });

  it("preserves the id suffix on a slug", () => {
    expect(
      normalizeLinkedInUrl("https://www.linkedin.com/in/jane-doe-8a1b2c3")
    ).toBe("https://www.linkedin.com/in/jane-doe-8a1b2c3");
  });

  it.each([
    ["non-LinkedIn host", "https://example.com/in/jane-doe"],
    ["look-alike host", "https://linkedin.com.evil.com/in/jane-doe"],
    ["embedded credentials", "https://user:pass@www.linkedin.com/in/jane-doe"],
    ["non-standard port", "https://www.linkedin.com:8080/in/jane-doe"],
    ["non-profile path", "https://www.linkedin.com/company/acme"],
    ["bare host, no /in/", "https://www.linkedin.com/"],
    ["feed path", "https://www.linkedin.com/feed/"],
    ["non-http(s) scheme", "ftp://www.linkedin.com/in/jane-doe"],
    ["javascript scheme", "javascript:alert(1)"],
    ["not a url", "just some text"],
    ["empty string", ""],
  ])("rejects %s", (_label, input) => {
    expect(normalizeLinkedInUrl(input)).toBeNull();
  });

  it("resolves dot-segments safely without escaping the host", () => {
    // `..` collapses within the path; it can never leave linkedin.com.
    expect(
      normalizeLinkedInUrl("https://www.linkedin.com/in/jane/../company")
    ).toBe("https://www.linkedin.com/in/company");
  });
});

describe("nameFromSlug", () => {
  it("title-cases a simple hyphenated slug", () => {
    expect(nameFromSlug("https://www.linkedin.com/in/jane-doe")).toBe(
      "Jane Doe"
    );
  });

  it("drops a trailing hex id segment", () => {
    expect(nameFromSlug("https://www.linkedin.com/in/jane-doe-8a1b2c3")).toBe(
      "Jane Doe"
    );
  });

  it("drops a trailing numeric id segment", () => {
    expect(nameFromSlug("https://www.linkedin.com/in/john-smith-12345")).toBe(
      "John Smith"
    );
  });

  it("handles a three-part name", () => {
    expect(nameFromSlug("https://www.linkedin.com/in/maria-del-carmen")).toBe(
      "Maria Del Carmen"
    );
  });

  it("decodes URL-encoded characters", () => {
    expect(nameFromSlug("https://www.linkedin.com/in/jos%C3%A9-garcia")).toBe(
      "José Garcia"
    );
  });

  it("ignores query and hash", () => {
    expect(nameFromSlug("https://www.linkedin.com/in/jane-doe?trk=x#y")).toBe(
      "Jane Doe"
    );
  });

  it("returns empty string when there is no /in/ segment", () => {
    expect(nameFromSlug("https://www.linkedin.com/company/acme")).toBe("");
  });
});
