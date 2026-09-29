/**
 * Offer-letter email rendering.
 *
 * Pure: turns an offer_letters row (plus the issuing company, when known) into
 * the subject / HTML / plain-text bodies that offerLetters.send mails to the
 * candidate and offerLetters.preview shows in the UI. No I/O.
 *
 * Every user-supplied value is HTML-escaped. The row's internal `notes` column
 * is never rendered: the UI labels it "Internal notes about this offer".
 */

type DateLike = Date | string | null | undefined;
type DecimalLike = string | number | null | undefined;

export interface OfferLetterEmailInput {
  candidateName: string;
  candidateEmail?: string | null;
  position: string;
  department?: string | null;
  startDate?: DateLike;
  salary?: DecimalLike;
  salaryPeriod?: string | null;
  bonus?: DecimalLike;
  equityShares?: DecimalLike;
  equityType?: string | null;
  vestingMonths?: number | null;
  cliffMonths?: number | null;
  benefits?: string | null;
  reportingTo?: string | null;
  location?: string | null;
  employmentType?: string | null;
  letterContent?: string | null;
  expiresAt?: DateLike;
}

export interface OfferLetterEmailCompany {
  name?: string | null;
  legalName?: string | null;
  functionalCurrency?: string | null;
  locale?: string | null;
}

export interface OfferLetterEmailOptions {
  /** Optional personal note from the sender, shown above the terms. */
  message?: string | null;
  /** Name used in the sign-off. */
  senderName?: string | null;
  /**
   * Public acceptance URL. The app has no public acceptance route today, so
   * callers omit it and the email asks the candidate to reply instead.
   */
  acceptUrl?: string | null;
}

export interface RenderedOfferLetterEmail {
  subject: string;
  html: string;
  text: string;
}

const PAY_FREQUENCY: Record<string, string> = {
  annual: "per year",
  monthly: "per month",
  hourly: "per hour",
};

const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Internship",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Collapse whitespace (incl. CR/LF) so user text cannot break a header line. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clean(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Format a calendar date as e.g. "October 1, 2026" without a timezone shift.
 * Dates are stored as midnight UTC ("2026-10-01" → 2026-10-01T00:00:00Z), so
 * formatting in the server's local zone would render the previous day west
 * of UTC. A bare YYYY-MM-DD string is read as-is.
 */
export function formatOfferDate(value: DateLike): string | undefined {
  if (value == null || value === "") return undefined;
  let date: Date;
  if (typeof value === "string") {
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    date = ymd ? new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))) : new Date(value);
  } else {
    date = value;
  }
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
}

function toNumber(value: DecimalLike): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export function formatMoney(value: DecimalLike, currency = "USD", locale = "en-US"): string | undefined {
  const n = toNumber(value);
  if (n === undefined) return undefined;
  const whole = Number.isInteger(n);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    // Unknown currency / locale code in the company row.
    return `${currency} ${n.toFixed(whole ? 0 : 2)}`;
  }
}

function formatShares(value: DecimalLike): string | undefined {
  const n = toNumber(value);
  if (n === undefined || n <= 0) return undefined;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function describeVesting(vestingMonths?: number | null, cliffMonths?: number | null): string | undefined {
  if (!vestingMonths) return undefined;
  const cliff = cliffMonths ? ` with a ${cliffMonths}-month cliff` : "";
  return `vesting over ${vestingMonths} months${cliff}`;
}

interface Term {
  label: string;
  value: string;
}

export function renderOfferLetterEmail(
  letter: OfferLetterEmailInput,
  company?: OfferLetterEmailCompany | null,
  options: OfferLetterEmailOptions = {},
): RenderedOfferLetterEmail {
  const companyName = clean(company?.name) ?? clean(company?.legalName);
  const currency = clean(company?.functionalCurrency) ?? "USD";
  const locale = clean(company?.locale) ?? "en-US";

  const candidateName = oneLine(letter.candidateName);
  const position = oneLine(letter.position);

  const terms: Term[] = [{ label: "Position", value: position }];
  const department = clean(letter.department);
  if (department) terms.push({ label: "Department", value: department });
  const reportingTo = clean(letter.reportingTo);
  if (reportingTo) terms.push({ label: "Reporting to", value: reportingTo });
  const employmentType = clean(letter.employmentType);
  if (employmentType) terms.push({ label: "Employment type", value: EMPLOYMENT_TYPE[employmentType] ?? employmentType });
  const location = clean(letter.location);
  if (location) terms.push({ label: "Location", value: location });
  const startDate = formatOfferDate(letter.startDate);
  if (startDate) terms.push({ label: "Start date", value: startDate });

  const salary = formatMoney(letter.salary, currency, locale);
  if (salary) {
    const period = clean(letter.salaryPeriod) ?? "annual";
    terms.push({ label: "Compensation", value: `${salary} ${PAY_FREQUENCY[period] ?? period}` });
  }
  const bonus = formatMoney(letter.bonus, currency, locale);
  if (bonus && toNumber(letter.bonus) !== 0) terms.push({ label: "Bonus", value: bonus });

  const shares = formatShares(letter.equityShares);
  if (shares) {
    const type = clean(letter.equityType);
    const vesting = describeVesting(letter.vestingMonths, letter.cliffMonths);
    terms.push({
      label: "Equity",
      value: [`${shares} shares${type ? ` (${type})` : ""}`, vesting].filter(Boolean).join(", "),
    });
  }

  const benefits = clean(letter.benefits);
  const letterBody = clean(letter.letterContent);
  const message = clean(options.message);
  const deadline = formatOfferDate(letter.expiresAt);
  const rawAcceptUrl = clean(options.acceptUrl);
  const acceptUrl = rawAcceptUrl && /^https?:\/\//i.test(rawAcceptUrl) ? rawAcceptUrl : undefined;
  const senderName = clean(options.senderName);
  const from = companyName ?? "the team";

  const subject = oneLine(`Offer of employment: ${position}${companyName ? ` at ${companyName}` : ""}`);

  const intro = `We are pleased to offer you the position of ${position}${companyName ? ` at ${companyName}` : ""}. The terms of the offer are below.`;
  const respond = acceptUrl
    ? "To accept this offer, use the link below."
    : "To accept this offer, reply to this email confirming your acceptance. If you have questions about any of the terms, reply and we will be happy to discuss them.";
  const deadlineLine = deadline ? `Please respond by ${deadline}.` : undefined;

  // ---- plain text
  const textParts: string[] = [`Dear ${candidateName},`, intro];
  if (message) textParts.push(message);
  textParts.push(terms.map((t) => `${t.label}: ${t.value}`).join("\n"));
  if (benefits) textParts.push(`Benefits:\n${benefits}`);
  if (letterBody) textParts.push(`Offer letter:\n\n${letterBody}`);
  textParts.push([respond, deadlineLine].filter(Boolean).join(" "));
  if (acceptUrl) textParts.push(`Accept the offer: ${acceptUrl}`);
  textParts.push(`Sincerely,\n${senderName ? `${senderName}\n` : ""}${from}`);
  const text = textParts.join("\n\n");

  // ---- HTML
  const e = escapeHtml;
  const multiline = (s: string) => e(s).replace(/\r?\n/g, "<br>");
  const rows = terms
    .map(
      (t) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;white-space:nowrap">${e(t.label)}</td>` +
        `<td style="padding:6px 0;vertical-align:top"><strong>${e(t.value)}</strong></td></tr>`,
    )
    .join("");
  const html = [
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${e(subject)}</title></head>`,
    `<body style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#222;max-width:640px;margin:0 auto;padding:24px">`,
    `<h2 style="margin:0 0 16px">Offer of employment</h2>`,
    `<p>Dear ${e(candidateName)},</p>`,
    `<p>${e(intro)}</p>`,
    message ? `<p style="border-left:3px solid #ccc;padding-left:12px;color:#444">${multiline(message)}</p>` : "",
    `<table style="border-collapse:collapse;margin:16px 0">${rows}</table>`,
    benefits ? `<h3 style="margin:24px 0 8px">Benefits</h3><p>${multiline(benefits)}</p>` : "",
    letterBody
      ? `<h3 style="margin:24px 0 8px">Offer letter</h3><div style="white-space:pre-wrap;border:1px solid #e5e5e5;border-radius:6px;padding:16px">${e(letterBody)}</div>`
      : "",
    `<p>${e(respond)}${deadlineLine ? ` <strong>${e(deadlineLine)}</strong>` : ""}</p>`,
    acceptUrl
      ? `<p><a href="${e(acceptUrl)}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">Accept offer</a></p>`
      : "",
    `<p>Sincerely,<br>${senderName ? `${e(senderName)}<br>` : ""}${e(from)}</p>`,
    `</body></html>`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
