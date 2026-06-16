# WhatsApp Supplier Messaging — Setup

The system can send and receive WhatsApp messages with suppliers/vendors through the
**Twilio WhatsApp Business API**, and surfaces those conversations in the Messaging hub,
on the Vendors page, and (via deep links) on inbound Shipments.

## Important: you need a dedicated business number

WhatsApp's API does **not** connect to the normal WhatsApp / WhatsApp Business *phone app*.
A number onboarded to the API is migrated off the app — you can't run both on the same
number. So live automation requires a **separate dedicated number** (a dedicated SIM, a
landline you can verify, or a number purchased through Twilio), onboarded to the WhatsApp
Business Platform and verified by Meta (typically a few days).

If you'd rather keep using the phone app, you don't need any of this — use the
**"Message supplier on WhatsApp"** deep link on a shipment, which opens WhatsApp on your
device with the supplier and message pre-filled. The steps below are only for live,
in-app send/receive.

## Onboarding checklist

1. **Twilio account** — create one at twilio.com and complete account verification.
2. **WhatsApp sender** — in the Twilio Console, register a WhatsApp sender
   (Messaging → Senders → WhatsApp). This runs Meta Business verification against the
   dedicated number. For testing first, use the Twilio WhatsApp **Sandbox**.
3. **Environment variables** (see `.env.example`):
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_NUMBER` — e.g. `whatsapp:+14155238886` (sandbox) or your approved sender
   - `PUBLIC_APP_URL` — your app's public HTTPS URL (used for status callbacks)
4. **Webhooks** — point your Twilio WhatsApp sender at these endpoints (signature-verified
   with `TWILIO_AUTH_TOKEN`):
   - Inbound messages → `POST {PUBLIC_APP_URL}/api/twilio/whatsapp/inbound`
   - Delivery/read status → `POST {PUBLIC_APP_URL}/api/twilio/whatsapp/status`
5. **Templates** — outside a 24-hour customer-service window, WhatsApp only allows
   pre-approved **message templates**. The schema carries `templateName`/`templateParams`;
   create and approve templates in the Twilio/Meta console before business-initiated sends.

## What works once configured

- **Send**: `crm.whatsapp.sendMessage` posts to Twilio and tracks the message SID + status.
  Without config, it falls back to recording a local "pending" log (no message leaves).
- **Receive**: the inbound webhook stores messages in `whatsapp_messages`, auto-links/creates
  the CRM contact by number, and logs a CRM interaction.
- **Documents**: files a supplier sends over WhatsApp (PDF/image/etc.) are downloaded from
  Twilio and saved into the ERP `documents` store (`referenceType: "whatsapp"`), so they
  outlive Twilio's short-lived media URLs. (Auto-parsing WhatsApp docs into invoice/PO
  records is a possible follow-up; today the email intake path does that richer parsing.)
- **Status**: delivery/read receipts update the stored message via the status webhook.
- **Vendors**: link a vendor to a WhatsApp number (Vendors page, or
  `scripts/backfill-vendor-contacts.ts`) to chat from the vendor row.
- **Shipments**: inbound material shipments show a "Message supplier on WhatsApp" action
  that targets the linked material's preferred vendor, pre-filled with shipment context.

## Without Twilio (phone-app users)

Everything above degrades gracefully: conversations can still be logged, and the shipment
and vendor **deep links** (`wa.me`) open your existing WhatsApp app with the supplier and a
pre-filled message. No credentials required.
