import { describe, it, expect } from "vitest";
import {
  normalizeLinkedInUrl,
  nameFromSlug,
  parseLlmJson,
} from "./linkedinCandidateService";

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
    [
      "percent-encoded slash in slug (%2F -> /)",
      "https://www.linkedin.com/in/%2Fcompany%2Facme",
    ],
    [
      "double-encoded percent in slug",
      "https://www.linkedin.com/in/jane%2525doe",
    ],
    ["not a url", "just some text"],
    ["empty string", ""],
  ])("rejects %s", (_label, input) => {
    expect(normalizeLinkedInUrl(input)).toBeNull();
  });

  it("accepts legitimate percent-encoded Unicode in the slug", () => {
    expect(
      normalizeLinkedInUrl("https://www.linkedin.com/in/jos%C3%A9-garcia")
    ).toBe("https://www.linkedin.com/in/jos%C3%A9-garcia");
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

  it("keeps a real name segment that happens to be valid hex ('baca')", () => {
    // "baca" matches /^[0-9a-f]{4,}$/i but has no digit, so it's not an id.
    expect(nameFromSlug("https://www.linkedin.com/in/ana-baca")).toBe(
      "Ana Baca"
    );
  });

  it("still drops a trailing id even after a hex-looking name segment", () => {
    expect(nameFromSlug("https://www.linkedin.com/in/ana-baca-8a1b2c3")).toBe(
      "Ana Baca"
    );
  });

  it("does not drop a hex-looking segment that isn't trailing", () => {
    // "dead" (all hex, no digit) mid-slug must be kept.
    expect(nameFromSlug("https://www.linkedin.com/in/dead-pool")).toBe(
      "Dead Pool"
    );
  });

  it("does not throw on malformed percent-encoding", () => {
    // `%zz` is not valid encoding; decodeURIComponent would throw.
    expect(() =>
      nameFromSlug("https://www.linkedin.com/in/jane%zz-doe")
    ).not.toThrow();
    expect(nameFromSlug("https://www.linkedin.com/in/jane%zz-doe")).toBe(
      "Jane%zz Doe"
    );
  });
});

describe("parseLlmJson", () => {
  it("parses a plain JSON object", () => {
    expect(parseLlmJson('{"name":"Jane Doe"}')).toEqual({ name: "Jane Doe" });
  });

  it("parses JSON wrapped in a ```json code fence", () => {
    const raw = '```json\n{"name":"Jane Doe","position":"Engineer"}\n```';
    expect(parseLlmJson(raw)).toEqual({
      name: "Jane Doe",
      position: "Engineer",
    });
  });

  it("parses JSON wrapped in a bare code fence", () => {
    expect(parseLlmJson('```\n{"name":"Jane"}\n```')).toEqual({ name: "Jane" });
  });

  it("recovers a JSON object embedded in prose", () => {
    const raw = 'Here is the candidate: {"name":"Jane Doe"} — hope that helps!';
    expect(parseLlmJson(raw)).toEqual({ name: "Jane Doe" });
  });

  it("returns null for non-JSON text", () => {
    expect(parseLlmJson("I could not find any information.")).toBeNull();
  });

  it("returns null for a JSON primitive (not an object)", () => {
    expect(parseLlmJson('"just a string"')).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseLlmJson("")).toBeNull();
  });
});
