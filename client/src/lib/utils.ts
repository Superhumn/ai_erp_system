import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A URL that is safe to put in an `href` or hand to `window.open`, or null.
 *
 * Values like `vendors.website` and `freightCarriers.contactSourceUrl` are typed
 * by a person and stored verbatim, so by the time they reach a link they are
 * untrusted: `javascript:alert(1)` in a website field executes on click, and a
 * bare `acme.com` navigates to a path on our own origin instead of the vendor.
 * Both are fixed here — non-http(s) schemes return null so the caller can render
 * plain text, and a scheme-less host gets https.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  // A leading "//" is protocol-relative, not a scheme; anything else with a
  // scheme keeps it so we can reject the dangerous ones explicitly.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
