/**
 * Company Website Sourcing
 *
 * Reads a company's contact details off the company's own website, so vendor and
 * carrier records stop being populated with numbers nobody has checked.
 *
 * The rule that makes this worth doing:
 *
 *   A contact detail counts as verified only if it appears on a page served by
 *   the company's own domain.
 *
 * That is a deterministic test, and it is exactly what catches the failure this
 * replaces. `freight.discoverCarriers` asks a model to supply an email and to
 * "use real public emails if known, otherwise format as info@domain.com" — so a
 * plausible-looking address lands in the carrier record and RFQs get mailed to
 * it. An address read off maersk.com is a fact with a URL behind it. An address
 * a model produced is a guess. This module only ever produces the first kind.
 *
 * Consequently there is no LLM in the contact path at all. Emails come from
 * `mailto:` links and page text, phones from `tel:` links, addresses from
 * schema.org JSON-LD. Every value carries the URL it was read from. A model
 * cannot add a contact detail here, only a page can.
 *
 * Anything found on a different domain — a freight-directory listing, a partner
 * page, an agency's address — is kept but marked `onOwnDomain: false` and never
 * promotes a record to verified.
 */

import { JSDOM } from "jsdom";
import { safeFetchHtml, BlockedUrlError, type SafeFetchResult } from "./webFetchGuard";

/** `querySelectorAll` as an array, which is how every caller here wants it. */
function queryAll(root: Document, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector));
}

// Paths worth trying beyond the homepage. Ordered by how likely they are to
// carry a real address rather than a form.
export const CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/contacts",
  "/about",
  "/about-us",
  "/imprint",
  "/impressum", // legally mandated contact page in DE/AT/CH — often the best source
  "/legal-notice",
] as const;

export const MAX_PAGES_PER_SITE = 4;

// ─── Types ─────────────────────────────────────────────────────────────

export interface SourcedValue {
  value: string;
  /** Page this exact value was read from. */
  sourceUrl: string;
  /** True when sourceUrl's host is the company's own domain. */
  onOwnDomain: boolean;
  /** How it was found, for auditing: a link is stronger evidence than loose text. */
  foundVia: "mailto" | "tel" | "jsonld" | "text";
}

export interface ExtractedContacts {
  emails: SourcedValue[];
  phones: SourcedValue[];
  addresses: SourcedValue[];
  companyNames: SourcedValue[];
}

export interface SourceWarning {
  code:
    | "off_domain_email"
    | "role_address_only"
    | "no_contact_found"
    | "page_unreachable"
    | "blocked_url"
    | "truncated";
  message: string;
}

export interface WebsiteSourceResult {
  websiteUrl: string;
  fetchedUrl: string | null;
  httpStatus: number | null;
  status: "ok" | "no_contact_found" | "fetch_failed" | "blocked";
  contacts: ExtractedContacts;
  warnings: SourceWarning[];
  pagesFetched: number;
  durationMs: number;
  error?: string;
}

// ─── Domain handling ───────────────────────────────────────────────────

/** Host without a leading "www.", lowercased. Null when unparseable. */
export function registrableHost(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * True when `candidate` is the same site as `base` — an exact match or a
 * subdomain of it. Deliberately strict about the boundary: "evil-maersk.com"
 * and "maersk.com.attacker.net" are both different sites.
 */
export function isSameSite(candidate: string | null, base: string | null): boolean {
  if (!candidate || !base) return false;
  if (candidate === base) return true;
  return candidate.endsWith(`.${base}`);
}

/** True when an email's domain belongs to the company's own site. */
export function emailOnOwnDomain(email: string, siteHost: string | null): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0 || !siteHost) return false;
  const domain = email.slice(at + 1).toLowerCase().replace(/^www\./, "");
  return isSameSite(domain, siteHost);
}

/** Role addresses (info@, sales@) are real and useful, just not a named person. */
const ROLE_LOCAL_PARTS = new Set([
  "info", "sales", "contact", "enquiries", "inquiries", "hello", "office",
  "support", "admin", "mail", "general", "logistics", "bookings", "quotes",
]);

export function isRoleAddress(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  return ROLE_LOCAL_PARTS.has(local);
}

// ─── Extraction (deterministic) ────────────────────────────────────────

// Deliberately conservative: no unicode locals, no trailing punctuation.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;

// Filenames like logo@2x.png and sample addresses are the two big false positives.
const EMAIL_REJECT_RE = /\.(png|jpe?g|gif|svg|webp|css|js)$/i;
const PLACEHOLDER_LOCALS = new Set(["example", "your", "youremail", "email", "name", "test", "sample"]);
const PLACEHOLDER_DOMAINS = new Set(["example.com", "example.org", "domain.com", "yourdomain.com", "email.com", "sentry.io"]);

export function isPlausibleEmail(email: string): boolean {
  if (EMAIL_REJECT_RE.test(email)) return false;
  const [local, domain] = email.toLowerCase().split("@");
  if (!local || !domain) return false;
  if (PLACEHOLDER_LOCALS.has(local)) return false;
  if (PLACEHOLDER_DOMAINS.has(domain)) return false;
  // "2x" in logo@2x.png style leftovers, and pure-numeric locals.
  if (/^\d+x?$/.test(local)) return false;
  return true;
}

/** Normalize a phone to digits with an optional leading +, for de-duplication. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim().replace(/^tel:/i, "");
  const plus = trimmed.trimStart().startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  // Shorter than 7 is not a dialable number; longer than 15 breaks E.164.
  if (digits.length < 7 || digits.length > 15) return null;
  return plus ? `+${digits}` : digits;
}

function pushUnique(list: SourcedValue[], next: SourcedValue, key: (v: string) => string) {
  const k = key(next.value);
  const existing = list.find(v => key(v.value) === k);
  if (!existing) {
    list.push(next);
    return;
  }
  // Prefer a same-domain sighting, then a link over loose text.
  if (!existing.onOwnDomain && next.onOwnDomain) {
    Object.assign(existing, next);
  } else if (existing.foundVia === "text" && next.foundVia !== "text") {
    existing.foundVia = next.foundVia;
    existing.sourceUrl = next.sourceUrl;
  }
}

/**
 * Pull contact details out of one HTML page. Pure — no network, no model — so it
 * can be tested against fixtures.
 */
export function extractContactsFromHtml(
  html: string,
  pageUrl: string,
  siteHost: string | null,
): ExtractedContacts {
  const contacts: ExtractedContacts = { emails: [], phones: [], addresses: [], companyNames: [] };
  const pageOnOwnDomain = isSameSite(registrableHost(pageUrl), siteHost);

  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url: pageUrl });
  } catch {
    return contacts;
  }
  const doc = dom.window.document;

  // ── mailto: and tel: links — the strongest signals on a page ──
  for (const anchor of queryAll(doc, "a[href^='mailto:']")) {
    const href = anchor.getAttribute("href") ?? "";
    const raw = decodeURIComponent(href.slice(7).split("?")[0]).trim();
    if (!raw || !isPlausibleEmail(raw)) continue;
    const value = raw.toLowerCase();
    pushUnique(contacts.emails, {
      value,
      sourceUrl: pageUrl,
      onOwnDomain: pageOnOwnDomain && emailOnOwnDomain(value, siteHost),
      foundVia: "mailto",
    }, v => v);
  }

  for (const anchor of queryAll(doc, "a[href^='tel:']")) {
    const href = anchor.getAttribute("href") ?? "";
    const value = normalizePhone(decodeURIComponent(href.slice(4)));
    if (!value) continue;
    pushUnique(contacts.phones, {
      value, sourceUrl: pageUrl, onOwnDomain: pageOnOwnDomain, foundVia: "tel",
    }, v => v);
  }

  // ── schema.org JSON-LD — where a site publishes structured contact data ──
  for (const script of queryAll(doc, "script[type='application/ld+json']")) {
    const parsed = safeJsonParse(script.textContent ?? "");
    if (!parsed) continue;
    for (const node of flattenJsonLd(parsed)) {
      const type = String((node as any)["@type"] ?? "").toLowerCase();
      if (!/organization|corporation|localbusiness|company/.test(type)) continue;

      const name = typeof (node as any).name === "string" ? (node as any).name.trim() : "";
      if (name) {
        pushUnique(contacts.companyNames, {
          value: name, sourceUrl: pageUrl, onOwnDomain: pageOnOwnDomain, foundVia: "jsonld",
        }, v => v.toLowerCase());
      }

      const address = formatPostalAddress((node as any).address);
      if (address) {
        pushUnique(contacts.addresses, {
          value: address, sourceUrl: pageUrl, onOwnDomain: pageOnOwnDomain, foundVia: "jsonld",
        }, v => v.toLowerCase());
      }

      for (const point of [node, ...toArray((node as any).contactPoint)]) {
        const email = typeof (point as any)?.email === "string" ? (point as any).email.trim().toLowerCase() : "";
        if (email && isPlausibleEmail(email)) {
          pushUnique(contacts.emails, {
            value: email,
            sourceUrl: pageUrl,
            onOwnDomain: pageOnOwnDomain && emailOnOwnDomain(email, siteHost),
            foundVia: "jsonld",
          }, v => v);
        }
        const phone = typeof (point as any)?.telephone === "string" ? normalizePhone((point as any).telephone) : null;
        if (phone) {
          pushUnique(contacts.phones, {
            value: phone, sourceUrl: pageUrl, onOwnDomain: pageOnOwnDomain, foundVia: "jsonld",
          }, v => v);
        }
      }
    }
  }

  // ── Visible text, last: weakest evidence, so it never overwrites a link ──
  const text = doc.body?.textContent ?? "";
  for (const match of text.match(EMAIL_RE) ?? []) {
    const value = match.toLowerCase();
    if (!isPlausibleEmail(value)) continue;
    pushUnique(contacts.emails, {
      value,
      sourceUrl: pageUrl,
      onOwnDomain: pageOnOwnDomain && emailOnOwnDomain(value, siteHost),
      foundVia: "text",
    }, v => v);
  }

  return contacts;
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** JSON-LD nests under @graph and arrays; walk it into a flat node list. */
function flattenJsonLd(root: unknown, depth = 0): unknown[] {
  if (depth > 6 || root === null || typeof root !== "object") return [];
  const nodes: unknown[] = [];
  for (const item of toArray(root)) {
    if (!item || typeof item !== "object") continue;
    nodes.push(item);
    const graph = (item as any)["@graph"];
    if (graph) nodes.push(...flattenJsonLd(graph, depth + 1));
  }
  return nodes;
}

function formatPostalAddress(address: unknown): string | null {
  if (!address) return null;
  if (typeof address === "string") return address.trim() || null;
  if (typeof address !== "object") return null;
  const a = address as Record<string, unknown>;
  const parts = [
    a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry,
  ]
    .map(p => (typeof p === "string" ? p.trim() : typeof p === "object" && p ? String((p as any).name ?? "").trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

// ─── Orchestration ─────────────────────────────────────────────────────

/** Ensure a bare "maersk.com" becomes a fetchable https URL. */
export function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Fetch a company's site and read its contact details off it.
 *
 * Fetches the homepage, then follows in-site links whose text or href looks like
 * a contact page, falling back to well-known paths. Stops at MAX_PAGES_PER_SITE.
 */
export async function sourceContactsFromWebsite(
  website: string,
  options: { maxPages?: number; timeoutMs?: number } = {},
): Promise<WebsiteSourceResult> {
  const startedAt = Date.now();
  const maxPages = Math.min(options.maxPages ?? MAX_PAGES_PER_SITE, MAX_PAGES_PER_SITE);
  const warnings: SourceWarning[] = [];
  const empty: ExtractedContacts = { emails: [], phones: [], addresses: [], companyNames: [] };

  const normalized = normalizeWebsiteUrl(website);
  if (!normalized) {
    return {
      websiteUrl: website, fetchedUrl: null, httpStatus: null, status: "blocked",
      contacts: empty, pagesFetched: 0, durationMs: Date.now() - startedAt,
      warnings: [{ code: "blocked_url", message: `"${website}" is not a usable website URL.` }],
      error: "Invalid website URL",
    };
  }

  const siteHost = registrableHost(normalized);
  const contacts: ExtractedContacts = { emails: [], phones: [], addresses: [], companyNames: [] };
  const visited = new Set<string>();
  let pagesFetched = 0;
  let firstStatus: number | null = null;
  let firstFetchedUrl: string | null = null;

  const queue: string[] = [normalized];

  while (queue.length > 0 && pagesFetched < maxPages) {
    const next = queue.shift() as string;
    if (visited.has(next)) continue;
    visited.add(next);

    let result: SafeFetchResult;
    try {
      result = await safeFetchHtml(next, { timeoutMs: options.timeoutMs });
    } catch (e) {
      if (e instanceof BlockedUrlError) {
        // The first page being blocked is fatal; a blocked sub-page is not.
        if (pagesFetched === 0) {
          return {
            websiteUrl: normalized, fetchedUrl: null, httpStatus: null, status: "blocked",
            contacts: empty, pagesFetched: 0, durationMs: Date.now() - startedAt,
            warnings: [{ code: "blocked_url", message: e.message }],
            error: e.message,
          };
        }
        warnings.push({ code: "blocked_url", message: e.message });
        continue;
      }
      if (pagesFetched === 0) {
        const message = e instanceof Error ? e.message : "Fetch failed";
        return {
          websiteUrl: normalized, fetchedUrl: null, httpStatus: null, status: "fetch_failed",
          contacts: empty, pagesFetched: 0, durationMs: Date.now() - startedAt,
          warnings: [{ code: "page_unreachable", message }],
          error: message,
        };
      }
      warnings.push({
        code: "page_unreachable",
        message: `${next}: ${e instanceof Error ? e.message : "fetch failed"}`,
      });
      continue;
    }

    pagesFetched++;
    if (firstStatus === null) {
      firstStatus = result.status;
      firstFetchedUrl = result.finalUrl;
    }
    if (result.truncated) {
      warnings.push({ code: "truncated", message: `${result.finalUrl} exceeded the size cap and was read partially.` });
    }
    if (!result.ok || !result.body) {
      warnings.push({ code: "page_unreachable", message: `${result.finalUrl} returned HTTP ${result.status}.` });
      continue;
    }

    const found = extractContactsFromHtml(result.body, result.finalUrl, siteHost);
    mergeContacts(contacts, found);

    // Queue contact-ish pages from the first page only, then well-known paths.
    if (pagesFetched === 1) {
      for (const candidate of contactLinksFrom(result.body, result.finalUrl, siteHost)) {
        if (!visited.has(candidate)) queue.push(candidate);
      }
      for (const path of CONTACT_PATHS) {
        const candidate = new URL(path, result.finalUrl).toString();
        if (!visited.has(candidate) && !queue.includes(candidate)) queue.push(candidate);
      }
    }
  }

  const ownDomainEmails = contacts.emails.filter(e => e.onOwnDomain);
  if (contacts.emails.length > 0 && ownDomainEmails.length === 0) {
    warnings.push({
      code: "off_domain_email",
      message:
        `Found ${contacts.emails.length} email address(es), none on ${siteHost}. ` +
        `They are recorded but cannot verify this company's contact details.`,
    });
  }
  if (ownDomainEmails.length > 0 && ownDomainEmails.every(e => isRoleAddress(e.value))) {
    warnings.push({
      code: "role_address_only",
      message: "Only role addresses (info@, sales@) were found — no named contact.",
    });
  }

  const foundAnything =
    contacts.emails.length > 0 || contacts.phones.length > 0 || contacts.addresses.length > 0;
  if (!foundAnything) {
    warnings.push({
      code: "no_contact_found",
      message: `No contact details were found on ${siteHost} after reading ${pagesFetched} page(s).`,
    });
  }

  return {
    websiteUrl: normalized,
    fetchedUrl: firstFetchedUrl,
    httpStatus: firstStatus,
    status: foundAnything ? "ok" : "no_contact_found",
    contacts,
    warnings,
    pagesFetched,
    durationMs: Date.now() - startedAt,
  };
}

function mergeContacts(into: ExtractedContacts, from: ExtractedContacts): void {
  for (const e of from.emails) pushUnique(into.emails, e, v => v);
  for (const p of from.phones) pushUnique(into.phones, p, v => v);
  for (const a of from.addresses) pushUnique(into.addresses, a, v => v.toLowerCase());
  for (const n of from.companyNames) pushUnique(into.companyNames, n, v => v.toLowerCase());
}

const CONTACT_LINK_RE = /contact|about|imprint|impressum|legal[- ]?notice|reach[- ]?us/i;

/** In-site links that look like contact pages. Same-site only. */
export function contactLinksFrom(html: string, pageUrl: string, siteHost: string | null): string[] {
  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url: pageUrl });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const anchor of queryAll(dom.window.document, "a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    const label = (anchor.textContent ?? "").trim();
    if (!CONTACT_LINK_RE.test(href) && !CONTACT_LINK_RE.test(label)) continue;
    let absolute: string;
    try {
      absolute = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    // Never leave the company's own site chasing a contact page.
    if (!isSameSite(registrableHost(absolute), siteHost)) continue;
    if (!out.includes(absolute)) out.push(absolute);
    if (out.length >= MAX_PAGES_PER_SITE) break;
  }
  return out;
}

// ─── Applying results to a record ──────────────────────────────────────

export interface ContactPatch {
  email: string | null;
  phone: string | null;
  address: string | null;
  /** Set only when the chosen email is on the company's own domain. */
  verified: boolean;
  sourceUrl: string | null;
}

/**
 * Choose the contact details to write onto a vendor/carrier record.
 *
 * Only same-domain values are eligible: an email found on a directory listing
 * does not become the record's email. A named address is preferred over a role
 * address, since `info@` is a mailbox and `j.smith@` is a person.
 */
export function chooseContactPatch(result: WebsiteSourceResult): ContactPatch {
  const ownEmails = result.contacts.emails.filter(e => e.onOwnDomain);
  const named = ownEmails.filter(e => !isRoleAddress(e.value));
  const chosenEmail = named[0] ?? ownEmails[0] ?? null;

  const ownPhones = result.contacts.phones.filter(p => p.onOwnDomain);
  const ownAddresses = result.contacts.addresses.filter(a => a.onOwnDomain);

  return {
    email: chosenEmail?.value ?? null,
    phone: ownPhones[0]?.value ?? null,
    address: ownAddresses[0]?.value ?? null,
    verified: !!chosenEmail,
    sourceUrl: chosenEmail?.sourceUrl ?? ownPhones[0]?.sourceUrl ?? ownAddresses[0]?.sourceUrl ?? null,
  };
}
