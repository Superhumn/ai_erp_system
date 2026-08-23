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
