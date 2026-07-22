# B2B Rocket — Automatic Lead Intake

B2B Rocket does **not** expose a usable public REST API. Its only supported
outbound integration is the Zapier **"New Lead"** trigger. So instead of polling
an API, we receive leads as a webhook: Zapier POSTs each newly generated lead to
this app, which AI-scores it and files it into the CRM.

```
B2B Rocket  ──(New Lead trigger)──▶  Zapier  ──(Webhooks by Zapier: POST)──▶  /webhooks/b2brocket/leads
                                                                                    │
                                                                   extract → AI score → upsert
                                                                                    ▼
                                                              crmContacts (source = "b2brocket")
```

Leads land in the CRM with `source = "b2brocket"`, an AI `leadScore` (0–100), a
starting `pipelineStage`, and a one-line AI `summary` in `notes`. They are
de-duplicated by email / phone / LinkedIn against existing contacts.

## 1. Configure the shared secret

Set an environment variable on the server — any long random string:

```
B2BROCKET_WEBHOOK_SECRET=<long-random-string>
```

In **production** the webhook rejects requests without a matching secret. In
development, if the variable is unset the endpoint is open (for local testing).

## 2. Build the Zap

1. **Trigger:** B2B Rocket → *New Lead*. Connect your B2B Rocket account.
2. **Action:** *Webhooks by Zapier* → *POST*.
   - **URL:** `https://<your-app-domain>/webhooks/b2brocket/leads?secret=<B2BROCKET_WEBHOOK_SECRET>`
     (or omit `?secret=` and send header `X-Webhook-Secret: <secret>`)
   - **Payload type:** `json`
   - **Data:** map the B2B Rocket lead fields. Field names are flexible — the
     endpoint recognizes common aliases case-insensitively:

     | CRM field      | Recognized payload keys                                    |
     |----------------|------------------------------------------------------------|
     | email          | `email`, `emailAddress`, `leadEmail`, `workEmail`          |
     | first name     | `firstName`, `first`, `givenName`                          |
     | last name      | `lastName`, `last`, `familyName`, `surname`               |
     | full name      | `fullName`, `name`, `contactName` (split if no first/last) |
     | company        | `company`, `companyName`, `organization`, `account`        |
     | job title      | `title`, `jobTitle`, `position`, `role`                    |
     | phone          | `phone`, `phoneNumber`, `mobile`                           |
     | linkedin       | `linkedinUrl`, `linkedin`, `linkedInProfile`              |
     | city/state/country | `city`, `state`/`region`, `country`                   |

3. **Test** the step. A `200 { "success": true, "contactId": ... }` response
   means the lead was filed. The raw payload is preserved in `captureData`.

## 3. Use the leads

- `crm.b2brocketLeads.list` — score-sorted leads (filter by `pipelineStage`,
  `minScore`, `search`).
- `crm.b2brocketLeads.stats` — `{ total, hot, avgScore }` (`hot` = score ≥ 70).
- They also appear in the normal CRM contacts list filtered by
  `source = "b2brocket"`, and are available as targets when building email
  sequences in the Operations → Email Inbox.

## Notes & limits

- The integration is **one-directional** (B2B Rocket → ERP). Zapier exposes B2B
  Rocket only as a trigger, so you cannot push sequences/leads back into B2B
  Rocket programmatically — it remains the outreach engine; this app becomes the
  system of record.
- AI scoring degrades gracefully: if the LLM is unavailable, the lead is still
  saved with score 0 / stage `new` and a "queued for manual review" note, so a
  scoring outage never drops an incoming lead.
- Backfill is also possible via CSV export from B2B Rocket → the app's Import
  tool (admin/ops), mapping columns to `crmContacts`.
