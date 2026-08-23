import { describe, it, expect } from "vitest";
import { planContactUpdate, type ContactRecordState } from "./companyContactSourcing";
import type { WebsiteSourceResult } from "./companyWebsiteSource";

const SITE = "acme-freight.com";

function siteResult(opts: {
  emails?: Array<[string, boolean]>;
  phones?: Array<[string, boolean]>;
  addresses?: Array<[string, boolean]>;
  websiteUrl?: string;
  status?: WebsiteSourceResult["status"];
}): WebsiteSourceResult {
  const src = `https://${SITE}/contact`;
  return {
    websiteUrl: opts.websiteUrl ?? `https://${SITE}/`,
    fetchedUrl: `https://${SITE}/`,
    httpStatus: 200,
    status: opts.status ?? "ok",
    contacts: {
      emails: (opts.emails ?? []).map(([value, onOwnDomain]) => ({
        value, onOwnDomain, sourceUrl: src, foundVia: "mailto" as const,
      })),
      phones: (opts.phones ?? []).map(([value, onOwnDomain]) => ({
        value, onOwnDomain, sourceUrl: src, foundVia: "tel" as const,
      })),
      addresses: (opts.addresses ?? []).map(([value, onOwnDomain]) => ({
        value, onOwnDomain, sourceUrl: src, foundVia: "jsonld" as const,
      })),
      companyNames: [],
    },
    warnings: [],
    pagesFetched: 1,
    durationMs: 5,
  };
}

const discovered: ContactRecordState = { website: `https://${SITE}/`, contactSource: "discovered" };

describe("planContactUpdate — promotion", () => {
  it("promotes a discovered record to website on an own-domain email", () => {
    const plan = planContactUpdate(discovered, siteResult({ emails: [["ops@acme-freight.com", true]] }));
    expect(plan.verified).toBe(true);
    expect(plan.patch.contactSource).toBe("website");
    expect(plan.patch.contactSourceUrl).toBe(`https://${SITE}/contact`);
    expect(plan.patch.contactVerifiedAt).toBeInstanceOf(Date);
    expect(plan.patch.email).toBe("ops@acme-freight.com");
  });

  it("leaves a discovered record unverified when only an off-domain address is found", () => {
    // The case this whole module exists for: a directory listing must not become
    // the carrier's address, and the record must stay un-mailable.
    const plan = planContactUpdate(discovered, siteResult({ emails: [["ops@freight-directory.com", false]] }));
    expect(plan.verified).toBe(false);
    expect(plan.patch.contactSource).toBeUndefined();
    expect(plan.patch.email).toBeUndefined();
    expect(plan.skipped.map(s => s.field)).toContain("email");
    expect(plan.skipped.some(s => s.field === "contactSource" && /cannot be sent an RFQ/.test(s.reason))).toBe(true);
  });

  it("does not promote on a phone number alone", () => {
    const plan = planContactUpdate(discovered, siteResult({ phones: [["+441394600100", true]] }));
    expect(plan.verified).toBe(false);
    expect(plan.patch.phone).toBe("+441394600100");
    expect(plan.patch.contactSource).toBeUndefined();
  });

  it("does not promote when the site could not be read", () => {
    const plan = planContactUpdate(discovered, siteResult({ status: "fetch_failed" }));
    expect(plan.verified).toBe(false);
    expect(plan.patch.contactSource).toBeUndefined();
  });

  it("promotes a manually-entered record too, and records where it came from", () => {
    const plan = planContactUpdate(
      { website: `https://${SITE}/`, contactSource: "manual" },
      siteResult({ emails: [["ops@acme-freight.com", true]] }),
    );
    expect(plan.patch.contactSource).toBe("website");
  });
});

describe("planContactUpdate — existing values", () => {
  const found = siteResult({
    emails: [["ops@acme-freight.com", true]],
    phones: [["+441394600100", true]],
  });

  it("keeps a value a person already entered", () => {
    const plan = planContactUpdate(
      { ...discovered, email: "known@acme-freight.com" },
      found,
    );
    expect(plan.patch.email).toBeUndefined();
    expect(plan.skipped.some(s => s.field === "email" && s.reason.includes("known@acme-freight.com"))).toBe(true);
    // Verification still happens — the site confirmed an own-domain address.
    expect(plan.verified).toBe(true);
  });

  it("replaces it when the caller asks to overwrite", () => {
    const plan = planContactUpdate(
      { ...discovered, email: "stale@acme-freight.com" },
      found,
      { overwriteExisting: true },
    );
    expect(plan.patch.email).toBe("ops@acme-freight.com");
    expect(plan.skipped.some(s => s.field === "email")).toBe(false);
  });

  it("normalizes a bare domain into the URL that was actually read", () => {
    const plan = planContactUpdate({ website: SITE, contactSource: "manual" }, found);
    expect(plan.patch.website).toBe(`https://${SITE}/`);
  });

  it("does not rewrite a website that already matches", () => {
    const plan = planContactUpdate({ website: `https://${SITE}/`, contactSource: "manual" }, found);
    expect(plan.patch.website).toBeUndefined();
  });
});

describe("planContactUpdate — nothing found", () => {
  it("returns an empty patch for a site with no contact details", () => {
    const plan = planContactUpdate({ website: `https://${SITE}/`, contactSource: "manual" }, siteResult({}));
    expect(plan.patch).toEqual({});
    expect(plan.applied).toEqual({});
    expect(plan.verified).toBe(false);
  });

  it("says nothing about contactSource for a record that was never discovered", () => {
    const plan = planContactUpdate({ website: `https://${SITE}/`, contactSource: "manual" }, siteResult({}));
    expect(plan.skipped.some(s => s.field === "contactSource")).toBe(false);
  });
});
