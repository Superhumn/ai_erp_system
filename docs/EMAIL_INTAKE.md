# Supplier Document Intake by Email (e.g. `ops@superhumn.co`)

Suppliers can email invoices, packing lists, BOLs, and other documents to a dedicated
address and have them **auto-filed and auto-linked** in the ERP. The system already runs an
inbox scanner; you just point it at the address you want suppliers to use.

## How it works (already live)

A background scanner polls the configured mailbox(es) every 5 minutes
(`server/_core/index.ts`), and for each new email it:

1. Stores the email (`inbound_emails`) and categorizes it.
2. Extracts attachments (PDF/image/spreadsheet, up to 5 MB) and runs them through
   `bulkImportDocuments` — saving each file to the `documents` store.
3. **Auto-links** the document to the right record via `emailDocumentLinker`:
   - **PO number** in the subject/body → purchase order
   - **Tracking number** → shipment
   - **Sender email / vendor name** → vendor (and their open POs)
4. Creates an in-app notification summarizing what was imported.
5. Runs category-specific automations. A message classified `vendor_quote` — a
   supplier quoting materials against one of our RFQs — is parsed into a
   structured quote, matched to the vendor and the open RFQ, and leveled against
   the other bids. See [`QUOTE_NORMALIZATION.md`](./QUOTE_NORMALIZATION.md).

So a supplier emailing an invoice to `ops@superhumn.co` results in a filed document linked
to the matching PO / shipment / vendor — no manual upload.

## Setup: point the scanner at `ops@superhumn.co`

`ops@superhumn.co` is a Google Workspace address, so use IMAP:

1. **Create the mailbox or alias** `ops@superhumn.co` in Google Workspace. A real mailbox
   is simplest; an alias works if it delivers into a mailbox the scanner can read.
2. **Credentials** — enable IMAP and create an **App Password** (Workspace account with 2FA),
   or use an OAuth app password. The scanner authenticates over IMAP/993 (TLS).
3. **Environment variables** (read in `server/_core/index.ts`):
   ```
   IMAP_HOST=imap.gmail.com
   IMAP_PORT=993
   IMAP_USER=ops@superhumn.co
   IMAP_PASSWORD=<app password>
   ```
   A second inbox is supported via `IMAP_HOST_2` / `IMAP_USER_2` / `IMAP_PASSWORD_2`.
4. **Tell suppliers** to send/forward documents to `ops@superhumn.co`. Existing threads can
   be forwarded in; attachments are what get parsed.

That's it — no new code. The scanner picks the mailbox up on the next poll.

## Why IMAP rather than an inbound-parse webhook

A SendGrid/Mailgun "inbound parse" webhook is the other common pattern, but here it would
require adding a multipart/MIME-parsing dependency (none is currently installed) and the same
DNS/MX + provider configuration — for no functional gain over the IMAP path, which already
exists and already auto-links. If you later want a provider webhook (e.g. to avoid managing a
mailbox), it can be added behind `POST /api/email/inbound`; it would reuse the same
`bulkImportDocuments` + `emailDocumentLinker` pipeline.

## Tips

- Best auto-linking happens when the **PO number** or **tracking number** appears in the
  email subject or body, and when the supplier's email is on file as the **vendor** contact.
- Attachments over 5 MB are skipped by the scanner; ask suppliers to send standard invoice
  PDFs rather than large scans.
