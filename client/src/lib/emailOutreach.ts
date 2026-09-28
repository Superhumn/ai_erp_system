/**
 * Pure helpers for the CRM campaign send + email sequence enrollment UI
 * (CRMAdmin campaigns, EmailInbox sequences).
 */

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "partially_failed" | "paused" | "cancelled";

/** Mirrors the server: recipients can change and the campaign can be sent from these. */
const SENDABLE: ReadonlySet<string> = new Set(["draft", "scheduled", "paused", "partially_failed"]);

export function canEditRecipients(status: string | null | undefined): boolean {
  return SENDABLE.has(status ?? "draft");
}

export function canSendCampaign(status: string | null | undefined): boolean {
  return SENDABLE.has(status ?? "draft");
}

export function campaignStatusLabel(status: string | null | undefined): string {
  const s = status ?? "draft";
  return s === "partially_failed" ? "partially failed" : s.replace(/_/g, " ");
}

/** Recipients that the next send will mail (never-sent + previously failed). */
export function unsentRecipientCount(recipients: ReadonlyArray<{ status?: string | null }>): number {
  return recipients.filter((r) => r.status === "pending" || r.status === "failed").length;
}

/** Count per status, in a stable display order; zero counts omitted. */
export function recipientStatusCounts(recipients: ReadonlyArray<{ status?: string | null }>): Array<[string, number]> {
  const order = ["pending", "sending", "sent", "delivered", "opened", "clicked", "failed", "skipped", "unsubscribed", "bounced"];
  const counts = new Map<string, number>();
  for (const r of recipients) {
    const s = r.status ?? "pending";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const known = order.filter((s) => counts.has(s)).map((s): [string, number] => [s, counts.get(s)!]);
  const extra = Array.from(counts.entries()).filter(([s]) => !order.includes(s));
  return [...known, ...extra];
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Local "yyyy-MM-ddTHH:mm" for an `<input type="datetime-local">`. Invalid → "". */
export function toDateTimeLocalValue(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "";
  return `${pad(value.getFullYear(), 4)}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

const DATETIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Parses a datetime-local value as local time. Blank / malformed → undefined. */
export function parseDateTimeLocal(value: string | null | undefined): Date | undefined {
  const m = DATETIME_LOCAL.exec((value ?? "").trim());
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Human summary of an enroll result for a toast. */
export function enrollSummary(res: { enrolled?: number; skipped?: ReadonlyArray<{ reason?: string }> }): string {
  const enrolled = res.enrolled ?? 0;
  const skipped = res.skipped ?? [];
  const parts = [`Enrolled ${enrolled} contact${enrolled === 1 ? "" : "s"}`];
  if (skipped.length) {
    const byReason = new Map<string, number>();
    for (const s of skipped) byReason.set(s.reason ?? "unknown", (byReason.get(s.reason ?? "unknown") ?? 0) + 1);
    parts.push(`skipped ${Array.from(byReason.entries()).map(([r, n]) => `${n} (${r.toLowerCase()})`).join(", ")}`);
  }
  return parts.join("; ");
}
