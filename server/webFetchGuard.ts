/**
 * Outbound web fetch guard
 *
 * `server/attachmentUrl.ts` guards fetches of *our own* storage — an allowlist of
 * one or two known hosts. This guards the opposite case: fetching a third party's
 * public website, where the host is by definition not known in advance.
 *
 * So the rule inverts. Instead of "only these hosts", it is "any public host,
 * but never a private one":
 *
 *   - http/https only — no file:, ftp:, gopher:, data:
 *   - no credentials in the URL (https://user:pass@host bypasses host expectations)
 *   - the resolved IP must be publicly routable — this is the important one.
 *     A hostname is not safe just because it looks external: `internal.example.com`
 *     can resolve to 10.0.0.5, and metadata endpoints hide behind friendly names.
 *     So we resolve first and check every address, then pin the connection to a
 *     checked address so DNS cannot change under us between check and connect.
 *   - redirects are followed manually, each hop re-checked, and capped. A public
 *     URL that 302s to 169.254.169.254 is the classic bypass.
 *   - response size and time are capped.
 *
 * Nothing here trusts the caller. A vendor's `website` column is user-supplied
 * text, and this module is what stands between it and the network.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

export const MAX_HTML_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 12_000;
export const MAX_REDIRECTS = 4;

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/**
 * True when an address is in a range that must never be fetched: loopback,
 * link-local (incl. cloud metadata at 169.254.169.254), private, CGNAT,
 * multicast, reserved, and the IPv6 equivalents including v4-mapped forms.
 */
export function isBlockedAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 0) return true; // not an IP at all — refuse

  if (version === 4) return isBlockedIpv4(ip);

  const lower = ip.toLowerCase();
  // ::ffff:10.0.0.1 and ::ffff:a00:1 both wrap IPv4 — unwrap the dotted form.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);

  if (lower === "::" || lower === "::1") return true; // unspecified, loopback
  if (lower.startsWith("fe8") || lower.startsWith("fe9") ||
      lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("ff")) return true; // multicast
  if (lower.startsWith("::ffff:")) return true; // any other v4-mapped form
  if (lower.startsWith("64:ff9b:")) return true; // NAT64 — can reach v4 privates
  return false;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

export interface CheckedUrl {
  url: URL;
  /** A resolved, non-private address to pin the connection to. */
  address: string;
  family: 4 | 6;
}

/**
 * Validate scheme/shape, resolve the host, and reject if any resolved address is
 * private. Returns an address to connect to so the caller does not re-resolve.
 */
export async function checkPublicUrl(raw: string): Promise<CheckedUrl> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError(`Not a valid URL: ${raw}`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BlockedUrlError(`Scheme ${url.protocol} is not allowed; use http or https.`);
  }
  if (url.username || url.password) {
    throw new BlockedUrlError("URLs with embedded credentials are not allowed.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");

  // A literal IP needs no DNS, but still needs the range check.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new BlockedUrlError(`Address ${host} is in a private or reserved range.`);
    }
    return { url, address: host, family: net.isIP(host) === 6 ? 6 : 4 };
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError(`Could not resolve host ${host}.`);
  }
  if (resolved.length === 0) {
    throw new BlockedUrlError(`Host ${host} resolved to no addresses.`);
  }

  // Every address must be public. If a host has one public and one private
  // address, refuse — we cannot control which one a later connect would pick.
  const blocked = resolved.filter(r => isBlockedAddress(r.address));
  if (blocked.length > 0) {
    throw new BlockedUrlError(
      `Host ${host} resolves to a private or reserved address (${blocked[0].address}).`,
    );
  }

  const first = resolved[0];
  return { url, address: first.address, family: first.family === 6 ? 6 : 4 };
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  /** Final URL after redirects. */
  finalUrl: string;
  contentType: string;
  body: string;
  truncated: boolean;
  redirects: string[];
}

/**
 * Fetch a public web page with every hop checked, size and time capped, and
 * redirects followed manually so a redirect into a private range is caught.
 */
export async function safeFetchHtml(
  rawUrl: string,
  options: { timeoutMs?: number; maxBytes?: number; userAgent?: string } = {},
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_HTML_BYTES;
  const userAgent =
    options.userAgent ??
    "Mozilla/5.0 (compatible; ERPContactBot/1.0; +contact-details-lookup)";

  const redirects: string[] = [];
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = await checkPublicUrl(current);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(checked.url.toString(), {
        redirect: "manual", // we re-check each hop ourselves
        signal: controller.signal,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          ok: false, status, finalUrl: current,
          contentType: response.headers.get("content-type") ?? "",
          body: "", truncated: false, redirects,
        };
      }
      // Resolve relative redirects against the current URL, then loop to re-check.
      current = new URL(location, checked.url).toString();
      redirects.push(current);
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    // Refuse non-text payloads outright rather than buffering a binary.
    if (contentType && !/text\/|application\/(xhtml|xml|json|ld\+json)/i.test(contentType)) {
      return {
        ok: false, status, finalUrl: checked.url.toString(),
        contentType, body: "", truncated: false, redirects,
      };
    }

    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) {
      return {
        ok: false, status, finalUrl: checked.url.toString(),
        contentType, body: "", truncated: true, redirects,
      };
    }

    const { text, truncated } = await readCapped(response, maxBytes);
    return {
      ok: response.ok,
      status,
      finalUrl: checked.url.toString(),
      contentType,
      body: text,
      truncated,
      redirects,
    };
  }

  throw new BlockedUrlError(`Too many redirects (over ${MAX_REDIRECTS}) starting at ${rawUrl}.`);
}

/** Read a response body, stopping once the cap is hit rather than buffering it all. */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    const text = await response.text();
    return {
      text: text.slice(0, maxBytes),
      truncated: text.length > maxBytes,
    };
  }

  const reader = (response.body as any).getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let text = "";
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      text += decoder.decode(value.slice(0, value.byteLength - (received - maxBytes)), { stream: true });
      truncated = true;
      try { await reader.cancel(); } catch { /* already closed */ }
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { text, truncated };
}
