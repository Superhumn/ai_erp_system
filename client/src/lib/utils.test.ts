import { describe, it, expect } from "vitest";
import { cn, safeExternalUrl } from "./utils";

describe("cn utility", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes via clsx", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("resolves tailwind conflicts via twMerge", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles undefined and null inputs", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });

  it("handles empty arguments", () => {
    expect(cn()).toBe("");
  });

  it("handles array inputs", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });
});

describe("safeExternalUrl", () => {
  it("adds https to a bare host", () => {
    expect(safeExternalUrl("acme-freight.com")).toBe("https://acme-freight.com/");
  });

  it("keeps an explicit http(s) URL", () => {
    expect(safeExternalUrl("http://acme.com/contact")).toBe("http://acme.com/contact");
  });

  it("refuses a javascript: URL", () => {
    // A vendor website field is typed by a person and rendered as a link.
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("  JavaScript:alert(1)")).toBeNull();
  });

  it("refuses other non-http schemes", () => {
    expect(safeExternalUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(safeExternalUrl("file:///etc/passwd")).toBeNull();
  });

  it("refuses a host with no dot, which would navigate within our own origin", () => {
    expect(safeExternalUrl("/operations/vendors")).toBeNull();
    expect(safeExternalUrl("localhost")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl("   ")).toBeNull();
  });
});
