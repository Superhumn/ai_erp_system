# Sourcing vendor and carrier contacts from their own websites

## The problem this fixes

`freight.discoverCarriers` used to ask a model for eight carriers *and their email
addresses*, with the instruction "use real public emails if known, otherwise
format as info@domain.com". The client wrote whatever came back straight into
`freightCarriers`, and `rfqs.sendToCarriers` then mailed it. A model-formatted
address is not a carrier's address — it is a guess at a mailbox that may belong
to someone else entirely, and the thing being mailed to it is a shipment
description with weights, HS codes and a delivery address.

So contact details now come from one of two places only: a person typed them, or
they were read off a page served by the company's own domain.

## Where a detail can come from

`vendors.contactSource` and `freightCarriers.contactSource` record it:

| Value           | Meaning                                                                 | Can receive an RFQ |
|-----------------|-------------------------------------------------------------------------|--------------------|
| `manual`        | A person entered it. The default for every pre-existing row.             | Yes                |
| `website`       | Read off the company's own domain. `contactSourceUrl` names the page.    | Yes                |
| `inbound_email` | Taken from correspondence the company itself sent us.                    | Yes                |
| `import`        | Came in through a bulk import.                                           | Yes                |
| `discovered`    | A model proposed the company. Nothing has confirmed how to reach it.     | **No**             |

`rfqs.sendToCarriers` and `vendorRfqs.sendToVendors` refuse `discovered` rows and
return them as `status: 'blocked'` with the reason, rather than sending.

## How a website read works

`server/companyWebsiteSource.ts`. There is no model anywhere in this path — the
extraction is deterministic, so it can be tested against fixtures and cannot
hallucinate an address.

1. **Normalize the website.** A bare `acme-freight.com` becomes
   `https://acme-freight.com/`. Anything without a dot in the host is rejected.
2. **Fetch the homepage** through `server/webFetchGuard.ts` (see below).
3. **Follow up to a few same-site contact links** — `/contact`, `/contact-us`,
   `/impressum`, `/about`, matched on href or link text. A "Contact us" link that
   points off the company's site is never followed.
4. **Extract from each page**, strongest signal first:
   - `mailto:` and `tel:` hrefs
   - schema.org JSON-LD `Organization` / `PostalAddress` / `ContactPoint`
     (including `@graph`-nested nodes)
   - loose text matches, which never overwrite a stronger sighting
5. **Mark each value** with the page it came from and whether it is on the
   company's own domain.

### What "own domain" means

`isSameSite` compares registrable hosts, exact-or-subdomain. `mail.acme-freight.com`
is the same site; `evil-acme-freight.com` and `acme-freight.com.attacker.net` are
not. An email counts as own-domain only if **both** its domain and the domain of
the page it was found on pass that test — the same address read off a directory
listing does not qualify.

### What gets written

`chooseContactPatch` picks a named address (`j.smith@…`) over a role address
(`info@…`, `sales@…`) when both exist. Off-domain values are never written to the
record at all.

Promotion is narrow, and only an **email on the company's own domain** does it:

- an own-domain email → `contactSource = 'website'`, `contactVerifiedAt` set,
  `contactSourceUrl` = the page it was on
- a phone number alone → written, but the record stays unverified
- an off-domain email → not written, and the reason is reported
- a site that 404s or times out → nothing written, logged as `fetch_failed`

Existing details are kept unless the caller passes `overwriteExisting`.

`server/companyContactSourcing.ts` splits this in two: `planContactUpdate` is a
pure function holding the whole judgement (and is what the tests exercise), and
`sourceCompanyContacts` is the thin wrapper that writes the patch and appends the
audit row.

## Fetching safely

`server/webFetchGuard.ts` — these are arbitrary third-party URLs, some of them
typed in by users, so the fetch is a server-side request forgery risk. The guard:

- allows `http:` and `https:` only, and rejects credentials embedded in the URL
- resolves the hostname and requires **every** returned address to be public —
  loopback, link-local (incl. `169.254.169.254`), private, CGNAT, multicast,
  reserved, and their IPv6 equivalents including `::ffff:` v4-mapped and NAT64
- follows redirects manually, re-running the check on every hop (max 4)
- refuses non-text content types
- caps the body at 2 MB by `Content-Length` and again while streaming
- times out at 12 s

This is the deny-private shape, distinct from `server/attachmentUrl.ts`, which
allowlists our own storage hosts. Different threat, different rule.

## Audit trail

Every attempt appends a `companyWebSources` row: the URL asked for, the URL
actually fetched, HTTP status, outcome, everything extracted, every warning, page
count, duration, and who asked. Read it with `vendors.webSources` /
`freight.carriers.webSources`. Nothing overwrites a contact detail without a row
here explaining where the new value came from.

## API

| Route                                     | Does                                                        |
|-------------------------------------------|-------------------------------------------------------------|
| `vendors.sourceFromWebsite`               | Read one vendor's site and apply what it finds               |
| `vendors.sourceFromWebsiteBatch`          | The same for up to 25 vendors, serially                      |
| `vendors.webSources`                      | Sourcing history for one vendor                              |
| `freight.carriers.sourceFromWebsite`      | Read one carrier's site                                      |
| `freight.carriers.sourceFromWebsiteBatch` | Up to 25 carriers, serially                                  |
| `freight.carriers.webSources`             | Sourcing history for one carrier                             |
| `freight.carriers.addDiscovered`          | Save a suggested carrier, then read its site                 |
| `freight.carriers.autoLinkContact`        | Match/link a CRM contact, mirroring `vendors.autoLinkContact` |
| `freight.carriers.linkContact` / `unlinkContact` | Manual CRM link                                      |

Batches are deliberately serial. A burst of parallel requests at one company's
infrastructure is how you get rate-limited or blocked.

## What `discoverCarriers` returns now

Name, type, country, website and notes — nothing else. The prompt explicitly
tells the model to omit the website rather than guess a domain, and the server
strips any field it volunteered beyond those five, so a stray `email` cannot
reach the client. Saving a suggestion stores it as `discovered` and immediately
tries the website; if that turns up an own-domain address the carrier is verified
and can be sent RFQs, otherwise it sits unverified until a person fills it in.

## Carrier contacts in the CRM

`freightCarriers.contactId` references `crmContacts`, the same as
`vendors.contactId`. `autoLinkContact` matches on email/phone and links on a hit,
so a carrier's contact is one CRM record rather than a duplicate.

## Tests

| File                                  | Covers                                              |
|---------------------------------------|-----------------------------------------------------|
| `server/webFetchGuard.test.ts`         | 36 — address classification, scheme, DNS, redirects |
| `server/companyWebsiteSource.test.ts`  | 35 — domain matching, HTML/JSON-LD extraction, patch choice |
| `server/companyContactSourcing.test.ts`| 11 — the promotion rule and existing-value handling |

The extraction tests run against HTML fixtures, so they cover the parsing without
any network access.
