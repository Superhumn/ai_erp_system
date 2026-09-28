/**
 * Attachment URL guard
 *
 * Routes that accept an attachment reference from a client and then fetch it
 * server-side (inbound quote parsing, document import) must not be able to
 * fetch arbitrary hosts. Without a guard, a caller can point the server at
 * cloud metadata (169.254.169.254), a service on the private network, or a
 * huge file, and have the contents read back through an LLM extraction.
 *
 * Two shapes are legitimate:
 *
 *   data:  — the inbound-mail path base64s attachment bytes it already holds
 *            and never leaves the process
 *   https: — a URL this system minted for its own object storage
 *
 * Everything else is rejected. The allowlist derives from the storage config,
 * so nothing has to be kept in sync by hand.
 */

import { ENV } from "./_core/env";

/** Cap on a fetched attachment, before it is base64'd into an LLM request. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export class UnsafeAttachmentUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeAttachmentUrlError";
  }
}

/**
 * Hosts this system may fetch attachments from: whatever object storage is
 * configured. Empty when storage is unconfigured, which correctly means no
 * remote URL is fetchable at all.
 */
export function allowedAttachmentHosts(): string[] {
  const hosts: string[] = [];

  if (ENV.r2PublicUrl) {
    try {
      hosts.push(new URL(ENV.r2PublicUrl).hostname.toLowerCase());
    } catch {
      // A malformed R2_PUBLIC_URL must not widen the allowlist.
    }
  }
  // Presigned GETs are issued against the account endpoint rather than the
  // public URL, so both forms have to be accepted.
  if (ENV.r2AccountId) {
    hosts.push(`${ENV.r2AccountId.toLowerCase()}.r2.cloudflarestorage.com`);
  }

  return hosts;
}

/**
 * Throw unless `url` is a data: URL or points at configured object storage.
 * Returns the URL unchanged so it can be used inline.
 */
export function assertFetchableAttachmentUrl(url: string): string {
  const raw = (url ?? "").trim();
  if (!raw) throw new UnsafeAttachmentUrlError("Attachment URL is empty.");

  // data: URLs are produced in-process from bytes we already have.
  if (/^data:/i.test(raw)) return raw;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UnsafeAttachmentUrlError("Attachment URL is not a valid URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UnsafeAttachmentUrlError(
      `Attachment URL scheme "${parsed.protocol}" is not allowed. Use an uploaded storage URL.`,
    );
  }

  const allowed = allowedAttachmentHosts();
  if (allowed.length === 0) {
    throw new UnsafeAttachmentUrlError(
      "No object storage is configured, so remote attachment URLs cannot be fetched.",
    );
  }

  const host = parsed.hostname.toLowerCase();
  // Exact host match only. A suffix match would let "evil-<bucket>.example.com"
  // through, and storage hosts are fixed values rather than a family of names.
  if (!allowed.includes(host)) {
    throw new UnsafeAttachmentUrlError(
      `Attachment URL host "${host}" is not an allowed storage host. ` +
        `Upload the file first and pass the storage URL it returns.`,
    );
  }

  return raw;
}

/** Non-throwing form, for callers that skip bad attachments rather than failing. */
export function isFetchableAttachmentUrl(url: string): boolean {
  try {
    assertFetchableAttachmentUrl(url);
    return true;
  } catch {
    return false;
  }
}

/** Bytes of an attachment plus the content type the source declared, if any. */
export interface FetchedAttachment {
  buffer: Buffer;
  contentType: string | null;
}

/**
 * Decode a data: URL without touching the network. Supports the base64 and
 * percent-encoded forms of RFC 2397.
 */
export function decodeDataUrl(url: string): FetchedAttachment {
  const comma = url.indexOf(",");
  if (!/^data:/i.test(url) || comma < 0) {
    throw new UnsafeAttachmentUrlError("Attachment data URL is malformed.");
  }
  const header = url.slice(5, comma);
  const body = url.slice(comma + 1);
  const params = header.split(";");
  const isBase64 = params.some((p) => p.trim().toLowerCase() === "base64");
  const contentType = params[0]?.trim() || null;
  const buffer = isBase64
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body), "utf8");
  return { buffer, contentType };
}

/**
 * Fetch an attachment's bytes safely. data: URLs are decoded in-process. For
 * remote URLs the host must be a configured storage host, and the request is
 * issued against a URL rebuilt from that configured host plus the caller's
 * path and query, so a caller can never steer the request at another host.
 * Enforces MAX_ATTACHMENT_BYTES both from Content-Length and the body read.
 */
export async function fetchAttachment(
  url: string,
  opts: { maxBytes?: number; kind?: string } = {},
): Promise<FetchedAttachment> {
  const maxBytes = opts.maxBytes ?? MAX_ATTACHMENT_BYTES;
  const kind = opts.kind ?? "attachment";
  const raw = assertFetchableAttachmentUrl(url);

  if (/^data:/i.test(raw)) {
    const decoded = decodeDataUrl(raw);
    if (decoded.buffer.byteLength > maxBytes) {
      throw new Error(
        `Refusing to process ${kind}: ${decoded.buffer.byteLength} bytes exceeds the ${maxBytes}-byte attachment limit.`,
      );
    }
    return decoded;
  }

  // assertFetchableAttachmentUrl already proved the host is on the allowlist;
  // take the host string from the allowlist itself so the request target is
  // built only from configuration plus the path.
  const parsed = new URL(raw);
  const allowed = allowedAttachmentHosts();
  const trustedHost = allowed.find((h) => h === parsed.hostname.toLowerCase());
  if (!trustedHost) {
    throw new UnsafeAttachmentUrlError("Attachment URL host is not an allowed storage host.");
  }
  const scheme = parsed.protocol === "http:" ? "http:" : "https:";
  const target = new URL(`${scheme}//${trustedHost}`);
  target.pathname = parsed.pathname;
  target.search = parsed.search;

  const response = await fetch(target.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch ${kind}: ${response.status}`);
  }
  // Content-Length is advisory and the header bag is absent on some fetch
  // implementations, so a missing value simply defers to the post-read check.
  const declared = Number(response?.headers?.get?.("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(
      `Refusing to fetch ${kind}: ${declared} bytes exceeds the ${maxBytes}-byte attachment limit.`,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new Error(
      `Refusing to process ${kind}: ${arrayBuffer.byteLength} bytes exceeds the ${maxBytes}-byte attachment limit.`,
    );
  }
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response?.headers?.get?.("content-type") ?? null,
  };
}
