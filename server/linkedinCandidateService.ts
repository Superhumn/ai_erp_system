// LinkedIn profile -> candidate enrichment.
//
// Given a public LinkedIn profile URL, fetch what we can server-side and use
// the LLM to extract structured candidate fields for the Recruiting "Add
// Candidate" flow. LinkedIn aggressively rate-limits / auth-walls anonymous
// requests, so this is best-effort: whatever we can pull from the page (Open
// Graph tags, JSON-LD, visible text) is handed to the model, and when the page
// is walled we still recover the person's name from the URL slug and flag that
// the details need manual review.

import { invokeLLM } from "./_core/llm";

export interface LinkedInCandidate {
  name: string;
  email: string;
  phone: string;
  position: string;
  location: string;
  resume: string;
  confidence: "high" | "medium" | "low";
}

export interface LinkedInImportResult extends LinkedInCandidate {
  source: "linkedin";
  /** whether the profile page itself was successfully retrieved */
  fetched: boolean;
  /** user-facing note when data is incomplete (auth wall, fetch failure, ...) */
  note?: string;
}

const EMPTY: LinkedInCandidate = {
  name: "",
  email: "",
  phone: "",
  position: "",
  location: "",
  resume: "",
  confidence: "low",
};

/** Accept only https linkedin.com profile URLs (avoids SSRF against internal hosts). */
export function normalizeLinkedInUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  url.protocol = "https:";
  return url.toString();
}

/** Turn a profile slug (…/in/jane-doe-8a1b2c3) into a rough display name. */
function nameFromSlug(url: string): string {
  const match = url.match(/\/in\/([^/?#]+)/i);
  if (!match) return "";
  return (
    decodeURIComponent(match[1])
      .split("-")
      // drop trailing id-ish segments (hex / digits) LinkedIn appends
      .filter(part => !/^[0-9a-f]{4,}$/i.test(part) && !/^\d+$/.test(part))
      .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(" ")
      .trim()
  );
}

/** Strip a fetched HTML page down to the text worth feeding the model. */
function extractReadableContent(html: string): string {
  const parts: string[] = [];

  const meta = (property: string) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`,
      "i"
    );
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    return content ? content.trim() : "";
  };

  const ogTitle = meta("og:title");
  const ogDescription = meta("og:description");
  if (ogTitle) parts.push(`Title: ${ogTitle}`);
  if (ogDescription) parts.push(`Summary: ${ogDescription}`);

  // JSON-LD blocks on public profiles often carry structured Person data.
  const ldMatches = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const m of ldMatches) {
    const json = m[1]?.trim();
    if (json) parts.push(`Structured data: ${json}`);
  }

  // Fallback: visible text, tags stripped.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text) parts.push(`Page text: ${text}`);

  return parts.join("\n\n").slice(0, 12000);
}

async function fetchProfileHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Present as a normal browser; LinkedIn still frequently walls us.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const OUTPUT_SCHEMA = {
  name: "linkedin_candidate",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", description: "Full name of the person" },
      email: { type: "string", description: "Email if present, else empty" },
      phone: { type: "string", description: "Phone if present, else empty" },
      position: {
        type: "string",
        description: "Current or most recent job title",
      },
      location: { type: "string", description: "City/region if present" },
      resume: {
        type: "string",
        description:
          "Concise background summary: current role & company, notable past roles, education, and key skills. Empty if nothing is available.",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description:
          "high = real profile data extracted; low = only the name could be inferred from the URL",
      },
    },
    required: [
      "name",
      "email",
      "phone",
      "position",
      "location",
      "resume",
      "confidence",
    ],
  },
} as const;

export async function importCandidateFromLinkedIn(
  rawUrl: string
): Promise<LinkedInImportResult> {
  const url = normalizeLinkedInUrl(rawUrl);
  if (!url) {
    throw new Error("Please provide a valid LinkedIn profile URL.");
  }

  const html = await fetchProfileHtml(url);
  const fetched = html != null;
  const content = html ? extractReadableContent(html) : "";
  const slugName = nameFromSlug(url);

  const systemPrompt =
    "You extract structured recruiting-candidate information from a LinkedIn " +
    "profile. Only use the provided page content and URL — never invent " +
    "employers, titles, contact details, or history. If the page content is a " +
    "login/sign-up wall or is otherwise empty, infer the person's name from " +
    "the URL slug, leave every other field blank, and set confidence to 'low'. " +
    "Return empty strings for anything you cannot determine.";

  const userPrompt = [
    `LinkedIn URL: ${url}`,
    slugName ? `Name inferred from URL slug: ${slugName}` : "",
    "",
    fetched
      ? "Page content:\n" + (content || "(the page returned no usable content)")
      : "The profile page could not be retrieved (LinkedIn blocked the request).",
  ]
    .filter(Boolean)
    .join("\n");

  let extracted: LinkedInCandidate = { ...EMPTY, name: slugName };
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      outputSchema: OUTPUT_SCHEMA,
      maxTokens: 1024,
    });
    const raw = response.choices[0]?.message?.content;
    if (typeof raw === "string" && raw.trim()) {
      const parsed = JSON.parse(raw) as Partial<LinkedInCandidate>;
      extracted = {
        name: (parsed.name || slugName || "").trim(),
        email: (parsed.email || "").trim(),
        phone: (parsed.phone || "").trim(),
        position: (parsed.position || "").trim(),
        location: (parsed.location || "").trim(),
        resume: (parsed.resume || "").trim(),
        confidence:
          parsed.confidence === "high" || parsed.confidence === "medium"
            ? parsed.confidence
            : "low",
      };
    }
  } catch {
    // Keep the slug-derived fallback below.
  }

  const thin = !extracted.position && !extracted.resume;
  const note =
    !fetched || extracted.confidence === "low" || thin
      ? "LinkedIn limited what could be pulled automatically. Review the fields and paste the profile summary if anything is missing."
      : undefined;

  return { ...extracted, source: "linkedin", fetched, note };
}
