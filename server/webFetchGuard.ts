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
 *   - the connection is pinned to the address we checked, via a custom `lookup`
 *     on the agent. Checking DNS and then letting the socket resolve again is a
 *     rebinding hole: the second answer can differ from the first. Pinning closes
 *     it while leaving the hostname in the URL, so SNI and certificate validation
 *     are unaffected.
 *   - redirects are followed manually, each hop re-checked, and capped. A public
 *     URL that 302s to 169.254.169.254 is the classic bypass.
 *   - response size and time are capped.
 *
 * Nothing here trusts the caller. A vendor's `website` column is user-supplied
 * text, and this module is what stands between it and the network.
 */

import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
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
 * Expand an IPv6 address to its eight 16-bit groups, or null if it will not parse.
 *
 * Prefix matching on the text form is not good enough here: `::1`, `0:0:0:0:0:0:0:1`
 * and `0000:...:0001` are the same address written three ways, and an SSRF guard
 * that only recognises one of them is not a guard. Comparing numbers avoids that
 * entirely.
 */
function expandIpv6(ip: string): number[] | null {
  let text = ip.toLowerCase();
  if (net.isIP(text) !== 6) return null;

  // A trailing dotted quad (::ffff:10.0.0.1, 2002::c000:203 written long-hand)
  // becomes two more groups.
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const octets = dotted[2].split(".").map(Number);
    if (octets.some(o => !Number.isInteger(o) || o < 0 || o > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${dotted[1]}${hi}:${lo}`;
  }

  const [head, tail, ...rest] = text.split("::");
  if (rest.length > 0) return null; // more than one "::" is not a valid address

  const parse = (part: string) => (part === "" ? [] : part.split(":").map(g => parseInt(g, 16)));
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);

  let groups: number[];
  if (tail === undefined) {
    groups = left;
  } else {
    const fill = 8 - left.length - right.length;
    if (fill < 0) return null;
    groups = [...left, ...Array(fill).fill(0), ...right];
  }

  if (groups.length !== 8 || groups.some(g => !Number.isInteger(g) || g < 0 || g > 0xffff)) {
    return null;
  }
  return groups;
}

/** The v4 address embedded in the last two groups, as a dotted string. */
function embeddedIpv4(groups: number[], at: number): string {
  const hi = groups[at];
  const lo = groups[at + 1];
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/**
 * True when an address is in a range that must never be fetched: loopback,
 * link-local (incl. cloud metadata at 169.254.169.254), private, CGNAT,
 * multicast, reserved, and the IPv6 equivalents — including the transition
 * mechanisms (v4-mapped, 6to4, Teredo, NAT64) that can carry a request into
 * IPv4 private space while looking like an ordinary v6 address.
 */
export function isBlockedAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 0) return true; // not an IP at all — refuse

  if (version === 4) return isBlockedIpv4(ip);

  const g = expandIpv6(ip);
  if (!g) return true; // unparseable — refuse

  const leadingZero = g.slice(0, 5).every(part => part === 0);

  if (g.every(part => part === 0)) return true; // :: unspecified
  if (leadingZero && g[5] === 0 && g[6] === 0 && g[7] === 1) return true; // ::1 loopback

  // ::ffff:a.b.c.d — v4-mapped. Judge it as the IPv4 address it really is.
  if (leadingZero && g[5] === 0xffff) return isBlockedIpv4(embeddedIpv4(g, 6));
  // ::a.b.c.d — deprecated v4-compatible, same reasoning.
  if (leadingZero && g[5] === 0 && !(g[6] === 0 && g[7] <= 1)) {
    return isBlockedIpv4(embeddedIpv4(g, 6));
  }

  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true; // 64:ff9b::/96 NAT64
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // 100::/64 discard
  if (g[0] === 0x2001 && g[1] === 0x0000) return true; // 2001::/32 Teredo — tunnels v4
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // 2001:db8::/32 documentation

  // 2002::/16 6to4 carries an IPv4 address in the next two groups, so a 6to4
  // address wrapping 10.0.0.1 must be refused just as 10.0.0.1 would be.
  if (g[0] === 0x2002) return isBlockedIpv4(embeddedIpv4(g, 1));

  return false;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b, c] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments + TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

export interface CheckedUrl {
  url: URL;
  /** The address the connection is pinned to. */
  address: string;
  family: 4 | 6;
}

/**
 * Validate scheme/shape, resolve the host, and reject if any resolved address is
 * private. Returns the address the caller must pin the connection to.
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

/**
 * A `lookup` that ignores the hostname and answers with the address we already
 * checked. This is what pins the socket: no second DNS answer can be substituted
 * between the check and the connect.
 */
function pinnedLookup(address: string, family: 4 | 6) {
  return (
    _hostname: string,
    options: any,
    callback?: (err: Error | null, addressOrList: any, family?: number) => void,
  ) => {
    const cb = (typeof options === "function" ? options : callback)!;
    const wantsAll = typeof options === "object" && options !== null && options.all;
    if (wantsAll) cb(null, [{ address, family }] as any);
    else cb(null, address, family);
  };
}

/** One HTTP response, reduced to what this module needs. */
export interface RawHttpResponse {
  status: number;
  headers: Record<string, string | undefined>;
  /** Body chunks. Not read at all when the response is a redirect. */
  body: AsyncIterable<Uint8Array>;
}

export type RequestFn = (
  checked: CheckedUrl,
  init: { headers: Record<string, string>; timeoutMs: number },
) => Promise<RawHttpResponse>;

/** The real transport: node http/https with the connection pinned. */
const nodeRequest: RequestFn = (checked, init) =>
  new Promise<RawHttpResponse>((resolve, reject) => {
    const isHttps = checked.url.protocol === "https:";
    const transport = isHttps ? https : http;
    const Agent = isHttps ? https.Agent : http.Agent;
    const agent = new Agent({
      keepAlive: false,
      lookup: pinnedLookup(checked.address, checked.family) as any,
    });

    const req = transport.request(
      checked.url,
      { method: "GET", agent, headers: init.headers, timeout: init.timeoutMs },
      res => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | undefined>,
          body: res,
        });
      },
    );

    req.on("timeout", () => req.destroy(new Error(`Timed out after ${init.timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });

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
 *
 * `request` exists so the redirect and size handling can be tested without a
 * network; production always uses the pinned node transport.
 */
export async function safeFetchHtml(
  rawUrl: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    userAgent?: string;
    request?: RequestFn;
  } = {},
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_HTML_BYTES;
  const request = options.request ?? nodeRequest;
  const userAgent =
    options.userAgent ??
    "Mozilla/5.0 (compatible; ERPContactBot/1.0; +contact-details-lookup)";

  const redirects: string[] = [];
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Every hop goes through the full check — a 302 into a private range is
    // refused here, by the same code that refused the original URL.
    const checked = await checkPublicUrl(current);

    const response = await request(checked, {
      timeoutMs,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en",
      },
    });

    const status = response.status;
    const contentType = response.headers["content-type"] ?? "";

    if (status >= 300 && status < 400) {
      const location = response.headers["location"];
      if (!location) {
        return {
          ok: false, status, finalUrl: current, contentType,
          body: "", truncated: false, redirects,
        };
      }
      await discard(response.body);
      // Resolve relative redirects against the current URL, then loop to re-check.
      current = new URL(location, checked.url).toString();
      redirects.push(current);
      continue;
    }

    // Refuse non-text payloads outright rather than buffering a binary.
    if (contentType && !/text\/|application\/(xhtml|xml|json|ld\+json)/i.test(contentType)) {
      await discard(response.body);
      return {
        ok: false, status, finalUrl: checked.url.toString(),
        contentType, body: "", truncated: false, redirects,
      };
    }

    const declared = Number(response.headers["content-length"] ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) {
      await discard(response.body);
      return {
        ok: false, status, finalUrl: checked.url.toString(),
        contentType, body: "", truncated: true, redirects,
      };
    }

    const { text, truncated } = await readCapped(response.body, maxBytes);
    return {
      ok: status >= 200 && status < 300,
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

/** Drain and drop a body we are not going to read, so the socket can close. */
async function discard(body: AsyncIterable<Uint8Array>): Promise<void> {
  try {
    if (typeof (body as any)?.destroy === "function") {
      (body as any).destroy();
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _chunk of body) { /* drain */ }
  } catch {
    /* the body is going away either way */
  }
}

/** Read a body, stopping once the cap is hit rather than buffering it all. */
async function readCapped(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let text = "";
  let truncated = false;

  for await (const chunk of body) {
    received += chunk.byteLength;
    if (received > maxBytes) {
      const keep = chunk.byteLength - (received - maxBytes);
      text += decoder.decode(chunk.slice(0, keep), { stream: true });
      truncated = true;
      if (typeof (body as any)?.destroy === "function") (body as any).destroy();
      break;
    }
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return { text, truncated };
}
