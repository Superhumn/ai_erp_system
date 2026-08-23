import { describe, it, expect } from "vitest";
import {
  chooseContactPatch,
  contactLinksFrom,
  emailOnOwnDomain,
  extractContactsFromHtml,
  isPlausibleEmail,
  isRoleAddress,
  isPublicSuffixLike,
  isSameSite,
  normalizePhone,
  normalizeWebsiteUrl,
  registrableHost,
  type WebsiteSourceResult,
} from "./companyWebsiteSource";

const SITE = "acme-freight.com";

describe("registrableHost / isSameSite", () => {
  it("strips www and lowercases", () => {
    expect(registrableHost("https://WWW.Acme-Freight.com/contact")).toBe("acme-freight.com");
  });

  it("treats subdomains as the same site", () => {
    expect(isSameSite("careers.acme-freight.com", SITE)).toBe(true);
    expect(isSameSite("acme-freight.com", SITE)).toBe(true);
  });

  it("rejects lookalike domains that merely embed the name", () => {
    // The two classic bypasses — a prefix and a suffix.
    expect(isSameSite("evil-acme-freight.com", SITE)).toBe(false);
    expect(isSameSite("acme-freight.com.attacker.net", SITE)).toBe(false);
  });

  it("returns false for unparseable input", () => {
    expect(registrableHost("not a url")).toBeNull();
    expect(isSameSite(null, SITE)).toBe(false);
  });

  it("refuses to treat a public suffix as a company's site", () => {
    // Otherwise a vendor recorded as "co.uk" would own every UK address.
    expect(isSameSite("someone-else.co.uk", "co.uk")).toBe(false);
    expect(isSameSite("anything.com", "com")).toBe(false);
    expect(emailOnOwnDomain("ops@someone-else.co.uk", "co.uk")).toBe(false);
  });

  it("still treats a real domain under a public suffix as a site", () => {
    expect(isSameSite("acme.co.uk", "acme.co.uk")).toBe(true);
    expect(isSameSite("mail.acme.co.uk", "acme.co.uk")).toBe(true);
  });
});

describe("isPublicSuffixLike", () => {
  it.each(["uk", "com", "co.uk", "com.au", "co.jp", "ne.jp", "org.uk"])(
    "flags %s",
    host => expect(isPublicSuffixLike(host)).toBe(true),
  );

  it.each(["acme.com", "acme.co.uk", "co.com", "info.net", "acme-freight.com"])(
    "leaves %s alone",
    host => expect(isPublicSuffixLike(host)).toBe(false),
  );
});

describe("emailOnOwnDomain", () => {
  it("accepts the company's own domain and its subdomains", () => {
    expect(emailOnOwnDomain("ops@acme-freight.com", SITE)).toBe(true);
    expect(emailOnOwnDomain("ops@mail.acme-freight.com", SITE)).toBe(true);
  });

  it("rejects a free-mail or third-party domain", () => {
    expect(emailOnOwnDomain("acmefreight@gmail.com", SITE)).toBe(false);
    expect(emailOnOwnDomain("ops@some-directory.com", SITE)).toBe(false);
  });

  it("rejects a lookalike domain", () => {
    expect(emailOnOwnDomain("ops@acme-freight.com.evil.net", SITE)).toBe(false);
  });
});

describe("isRoleAddress", () => {
  it("recognises shared mailboxes, which rank below a named person", () => {
    expect(isRoleAddress("info@acme-freight.com")).toBe(true);
    expect(isRoleAddress("BOOKINGS@acme-freight.com")).toBe(true);
  });

  it("treats a named mailbox as a person", () => {
    expect(isRoleAddress("j.smith@acme-freight.com")).toBe(false);
  });
});

describe("isPlausibleEmail", () => {
  it("rejects image filenames that look like addresses", () => {
    expect(isPlausibleEmail("logo@2x.png")).toBe(false);
    expect(isPlausibleEmail("icon@3x.jpg")).toBe(false);
  });

  it("rejects placeholder addresses", () => {
    expect(isPlausibleEmail("you@example.com")).toBe(false);
    expect(isPlausibleEmail("name@yourdomain.com")).toBe(false);
    expect(isPlausibleEmail("email@domain.com")).toBe(false);
  });

  it("accepts a normal address", () => {
    expect(isPlausibleEmail("j.smith@acme-freight.com")).toBe(true);
  });
});

describe("normalizePhone", () => {
  it("keeps a leading + and strips formatting", () => {
    expect(normalizePhone("+1 (555) 010-9900")).toBe("+15550109900");
    expect(normalizePhone("tel:+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects strings too short or too long to dial", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("1234567890123456789")).toBeNull();
  });
});

describe("normalizeWebsiteUrl", () => {
  it("adds https to a bare domain", () => {
    expect(normalizeWebsiteUrl("acme-freight.com")).toBe("https://acme-freight.com/");
  });

  it("leaves an explicit scheme alone", () => {
    expect(normalizeWebsiteUrl("http://acme-freight.com/x")).toBe("http://acme-freight.com/x");
  });

  it("rejects something with no dot in the host", () => {
    expect(normalizeWebsiteUrl("localhost")).toBeNull();
    expect(normalizeWebsiteUrl("   ")).toBeNull();
  });

  it("rejects embedded credentials rather than storing them", () => {
    // This value is written to vendors.website and rendered as a link.
    expect(normalizeWebsiteUrl("https://user:pass@acme-freight.com")).toBeNull();
  });

  it("rejects a non-http scheme", () => {
    expect(normalizeWebsiteUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsiteUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeWebsiteUrl("ftp://acme-freight.com")).toBeNull();
  });

  it("rejects a bare public suffix", () => {
    expect(normalizeWebsiteUrl("co.uk")).toBeNull();
  });
});

// ─── HTML extraction ───────────────────────────────────────────────────

const CONTACT_PAGE = `
<!doctype html><html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Acme Freight Ltd",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "12 Dock Road",
    "addressLocality": "Felixstowe",
    "postalCode": "IP11 3TX",
    "addressCountry": "GB"
  },
  "contactPoint": [
    { "@type": "ContactPoint", "email": "bookings@acme-freight.com", "telephone": "+44 1394 600100" }
  ]
}
</script>
</head><body>
  <p>Reach our team at <a href="mailto:j.smith@acme-freight.com">Jane Smith</a></p>
  <p>General enquiries: <a href="mailto:info@acme-freight.com">info@acme-freight.com</a></p>
  <p>Call <a href="tel:+441394600100">+44 1394 600100</a></p>
  <p>Our listing partner: partners@freight-directory.com</p>
  <img src="/logo@2x.png" alt="logo">
</body></html>`;

describe("extractContactsFromHtml", () => {
  const page = "https://acme-freight.com/contact";

  it("reads mailto links and marks own-domain addresses", () => {
    const c = extractContactsFromHtml(CONTACT_PAGE, page, SITE);
    const jane = c.emails.find(e => e.value === "j.smith@acme-freight.com");
    expect(jane?.onOwnDomain).toBe(true);
    expect(jane?.foundVia).toBe("mailto");
    expect(jane?.sourceUrl).toBe(page);
  });

  it("keeps an off-domain address but does not mark it own-domain", () => {
    const c = extractContactsFromHtml(CONTACT_PAGE, page, SITE);
    const partner = c.emails.find(e => e.value === "partners@freight-directory.com");
    expect(partner).toBeTruthy();
    expect(partner?.onOwnDomain).toBe(false);
  });

  it("does not mistake an image filename for an address", () => {
    const c = extractContactsFromHtml(CONTACT_PAGE, page, SITE);
    expect(c.emails.some(e => e.value.includes("2x.png"))).toBe(false);
  });

  it("reads tel links", () => {
    const c = extractContactsFromHtml(CONTACT_PAGE, page, SITE);
    expect(c.phones[0].value).toBe("+441394600100");
    expect(c.phones[0].foundVia).toBe("tel");
  });

  it("reads a JSON-LD postal address and company name", () => {
    const c = extractContactsFromHtml(CONTACT_PAGE, page, SITE);
    expect(c.addresses[0].value).toBe("12 Dock Road, Felixstowe, IP11 3TX, GB");
    expect(c.companyNames[0].value).toBe("Acme Freight Ltd");
  });

  it("reads a JSON-LD contactPoint email", () => {
    const c = extractContactsFromHtml(CONTACT_PAGE, page, SITE);
    const bookings = c.emails.find(e => e.value === "bookings@acme-freight.com");
    expect(bookings?.onOwnDomain).toBe(true);
  });

  it("walks @graph-nested JSON-LD", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@graph":[{"@type":"WebSite"},{"@type":"Organization","name":"Nested Co",
       "contactPoint":{"email":"ops@acme-freight.com"}}]}
    </script></head><body></body></html>`;
    const c = extractContactsFromHtml(html, page, SITE);
    expect(c.emails.some(e => e.value === "ops@acme-freight.com")).toBe(true);
    expect(c.companyNames.some(n => n.value === "Nested Co")).toBe(true);
  });

  it("marks values from an off-domain page as not own-domain", () => {
    // Same email, but read from a directory site rather than the company's own.
    const c = extractContactsFromHtml(
      `<html><body><a href="mailto:ops@acme-freight.com">x</a></body></html>`,
      "https://freight-directory.com/listing/acme",
      SITE,
    );
    expect(c.emails[0].onOwnDomain).toBe(false);
  });

  it("does not let loose text downgrade a mailto sighting", () => {
    const html = `<html><body>
      <a href="mailto:ops@acme-freight.com">mail us</a>
      <p>ops@acme-freight.com</p>
    </body></html>`;
    const c = extractContactsFromHtml(html, page, SITE);
    expect(c.emails).toHaveLength(1);
    expect(c.emails[0].foundVia).toBe("mailto");
  });

  it("survives malformed JSON-LD without throwing", () => {
    const html = `<html><head><script type="application/ld+json">{not json</script></head>
      <body><a href="mailto:ops@acme-freight.com">x</a></body></html>`;
    expect(() => extractContactsFromHtml(html, page, SITE)).not.toThrow();
    expect(extractContactsFromHtml(html, page, SITE).emails).toHaveLength(1);
  });

  it("returns nothing for a page with no contact details", () => {
    const c = extractContactsFromHtml("<html><body><p>Welcome</p></body></html>", page, SITE);
    expect(c.emails).toHaveLength(0);
    expect(c.phones).toHaveLength(0);
  });
});

describe("contactLinksFrom", () => {
  const home = "https://acme-freight.com/";

  it("finds contact pages by href or link text", () => {
    const html = `<html><body>
      <a href="/contact-us">Get in touch</a>
      <a href="/company/impressum">Impressum</a>
      <a href="/pricing">Pricing</a>
    </body></html>`;
    const links = contactLinksFrom(html, home, SITE);
    expect(links).toContain("https://acme-freight.com/contact-us");
    expect(links).toContain("https://acme-freight.com/company/impressum");
    expect(links.some(l => l.includes("/pricing"))).toBe(false);
  });

  it("never follows a contact link off the company's site", () => {
    const html = `<a href="https://freight-directory.com/contact">Contact us</a>`;
    expect(contactLinksFrom(html, home, SITE)).toHaveLength(0);
  });

  it("ignores mailto, tel and anchor hrefs", () => {
    const html = `<a href="mailto:x@acme-freight.com">contact</a><a href="#contact">contact</a>`;
    expect(contactLinksFrom(html, home, SITE)).toHaveLength(0);
  });
});

// ─── Choosing what to write onto the record ────────────────────────────

function resultWith(emails: Array<[string, boolean]>, phones: Array<[string, boolean]> = []): WebsiteSourceResult {
  return {
    websiteUrl: `https://${SITE}/`,
    fetchedUrl: `https://${SITE}/`,
    httpStatus: 200,
    status: "ok",
    contacts: {
      emails: emails.map(([value, onOwnDomain]) => ({
        value, onOwnDomain, sourceUrl: `https://${SITE}/contact`, foundVia: "mailto" as const,
      })),
      phones: phones.map(([value, onOwnDomain]) => ({
        value, onOwnDomain, sourceUrl: `https://${SITE}/contact`, foundVia: "tel" as const,
      })),
      addresses: [],
      companyNames: [],
    },
    warnings: [],
    pagesFetched: 1,
    durationMs: 10,
  };
}

describe("chooseContactPatch", () => {
  it("prefers a named address over a role address", () => {
    const patch = chooseContactPatch(
      resultWith([["info@acme-freight.com", true], ["j.smith@acme-freight.com", true]]),
    );
    expect(patch.email).toBe("j.smith@acme-freight.com");
    expect(patch.verified).toBe(true);
  });

  it("falls back to a role address when that is all there is", () => {
    const patch = chooseContactPatch(resultWith([["info@acme-freight.com", true]]));
    expect(patch.email).toBe("info@acme-freight.com");
    expect(patch.verified).toBe(true);
  });

  it("refuses to write an off-domain address, and stays unverified", () => {
    // This is the case that matters: a directory listing must not become the
    // carrier's email just because it was the only one found.
    const patch = chooseContactPatch(resultWith([["ops@freight-directory.com", false]]));
    expect(patch.email).toBeNull();
    expect(patch.verified).toBe(false);
  });

  it("records the page a chosen value came from", () => {
    const patch = chooseContactPatch(resultWith([["ops@acme-freight.com", true]]));
    expect(patch.sourceUrl).toBe(`https://${SITE}/contact`);
  });

  it("returns an empty, unverified patch when nothing was found", () => {
    const patch = chooseContactPatch(resultWith([]));
    expect(patch).toMatchObject({ email: null, phone: null, address: null, verified: false });
  });

  it("keeps an own-domain phone even when no email qualifies", () => {
    const patch = chooseContactPatch(
      resultWith([["ops@freight-directory.com", false]], [["+441394600100", true]]),
    );
    expect(patch.phone).toBe("+441394600100");
    expect(patch.verified).toBe(false); // phone alone does not verify the record
  });
});
