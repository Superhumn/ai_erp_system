# Thread Follow-Up workflow

Automates polite, timezone-aware follow-up ("nudge") emails on outbound asks
that are awaiting a reply. Behavior depends on whether the contact is an
**active vendor** — looked up from our records, never inferred from the email.

- Workflow: `server/threadFollowUp.ts`
- Send-window / business-day / holiday / timezone helpers: `server/_core/businessDays.ts`
- DB helpers: `server/db/threadFollowUp.ts`
- Tables: `email_thread_followups`, `thread_followup_logs` (migration `drizzle/0050_thread_followup_workflow.sql`)
- Daily scan wired in `server/_core/index.ts`

## Who counts as an active vendor

`ACTIVE VENDOR` = an existing relationship with us:

- an **active contract** (`contracts.type='vendor'`, `status='active'`), or
- a **purchase order** (any non-cancelled `purchase_orders` row for the vendor), or
- a **completed vendor payment** (`payments.type='made'`/`status='completed'`), or
- the vendor is **marked active** in the vendor table (`vendors.status='active'`).

Resolved by `determineActiveVendor` from our records. Re-checked at send time, so
a relationship that changes mid-sequence is honored.

## Cadence

Business-day gaps are measured from our last outbound message (the original ask,
then each nudge). See `planStep`.

**Not an active vendor** (prospects, cold outreach, unknown companies):

| Step | When | Action |
|------|------|--------|
| Nudge 1 | 5 business days after the unanswered ask | one nudge |
| Drop | 5 business days later, still nothing | mark `dropped_no_response`, stop forever |

Silence is an answer. We do not chase.

**Active vendor** (never drops):

| Step | When | Action |
|------|------|--------|
| Nudge 1 | 3 business days after the unanswered message | reply in-thread |
| Nudge 2 | 5 business days later | reply in-thread |
| Nudge 3 | 5 business days later | also **cc our thread owner** |
| Nudge 4 | 5 business days later | send to **their manager / alternate contact** if on record |
| Escalate | 5 business days later | create a **HIGH** priority `project_tasks` item for the thread owner (`[Vendor] … not responding - X days`) with the thread history, then stop automated email — a human takes over |

Max **4** automated emails, then a human decides.

## Stop conditions (cancel immediately, re-checked at send time)

- They reply, at all → `resolved` (`reply_received`)
- A human on our side sends a manual reply → `resolved` (`manual_reply`)
- The linked task/PO/deal is closed or cancelled → `resolved` (`linked_entity_closed`)
- They ask us not to follow up → `resolved` (`opted_out`)
- **Out-of-office** detected → **pause the clock**, resume on/after their return date
  (not a stop). `detectOutOfOffice` parses the return date when present.

Hooks: `recordInboundReply`, `recordManualReply`, `optOutThread`,
`pauseForOutOfOffice`. Enroll a thread with `enrollThread`.

## Timing

- Send **Tue–Thu only, 09:00–16:00 in the recipient's local timezone**. Never
  Mon, Fri, or weekends.
- Skip **public holidays** in the recipient's country (US, India, South Africa,
  Colombia). The holiday table in `businessDays.ts` covers 2025–2027 and must be
  extended annually.
- The recipient timezone comes from the thread's `timezone` column if set,
  otherwise a per-country default; the country drives the holiday calendar.

The daily job re-checks the send window per thread and reschedules to the next
valid slot rather than sending off-window.

## Tone

Replies stay in the existing thread — never a new subject line. Under 4
sentences. No guilt, no urgency, no "just circling back," no "bumping this."
The ask is restated in one line; later nudges get more specific (naming what
we're waiting on and what it's holding up), not more aggressive. Enforced by
`generateNudgeBody` + `BANNED_PHRASES` and tested.

## Data

`email_thread_followups` tracks each thread: `isActiveVendor`, `nudgeCount`,
`nextNudgeAt`, `status` (`active | dropped_no_response | escalated_to_human |
resolved`), `pausedUntil`, `lastInboundAt`, `lastOutboundAt`, plus recipient
routing (`contactEmail`, `managerEmail`, `threadOwnerId`, `country`, `timezone`)
and the ask (`askSummary`, `holdingUp`).

A **daily job** scans for `nextNudgeAt <= now` and re-checks all stop conditions
**at send time**, not schedule time — a thread that got a reply after scheduling
does not send.

## Sending

Nudges reply inside the existing thread. When the follow-up row has a
`gmailThreadId` + `gmailMessageId` and the thread owner has a connected Google
account, the nudge is sent via Gmail (`server/_core/gmail.ts`
`replyToGmailMessage`) with real `In-Reply-To`/`References` headers and native
`cc` / alternate-recipient delivery; the id of the sent message is stored back
as the new `gmailMessageId` so the next nudge replies to it. Without that
context it falls back to the transactional email queue (`queueEmail`), recording
cc/threading intent in metadata. Populate the Gmail ids via `enrollThread`.

## Logging

Every nudge sent, every nudge skipped (with reason), every drop and every
escalation is written to `thread_followup_logs` (and echoed to stdout). Review
with:

```
pnpm tsx scripts/thread-followup-report.ts        # last 7 days
pnpm tsx scripts/thread-followup-report.ts 14      # last 14 days
```

## Safety — dry-run is default ON

The daily job runs in **dry-run by default**: it logs exactly what it would send
and sends nothing (no email, no task). Set `THREAD_FOLLOWUP_DRY_RUN="false"` to
go live. Recommended: run a week in dry-run, review `thread_followup_logs`, then
reset the follow-up rows (dry-run advances state so the full sequence is
simulated) before enabling live sends.
