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
  loopback, link-local (incl. `169.254.169.254`), private, CGNAT, multicast, and
  the reserved ranges (TEST-NET, benchmarking, 6to4 relay anycast)
- for IPv6, parses the address into its eight groups and compares numerically
  rather than matching text prefixes, so `::1` and `0:0:0:0:0:0:0:1` are the same
  address to it. Blocks link-local, ULA, multicast, discard-only, documentation,
  and — importantly — the transition mechanisms that can carry a request into
  IPv4 private space while looking like an ordinary v6 address: `::ffff:`
  v4-mapped, `::a.b.c.d` v4-compatible, `2002::/16` 6to4, `2001::/32` Teredo and
  `64:ff9b::/96` NAT64. A 6to4 address wrapping `10.0.0.1` is refused exactly as
  `10.0.0.1` would be.
- **pins the connection to the address it checked**, via a custom `lookup` on the
  agent. Checking DNS and then letting the socket resolve again is a rebinding
  hole — the second answer can differ from the first. Pinning closes it while
  leaving the hostname in the URL, so SNI and certificate validation are
  unaffected. This is why the fetch uses `node:http`/`node:https` rather than
  global `fetch`, which has no way to supply a lookup.
- follows redirects manually, re-running the whole check on every hop (max 4)
- refuses non-text content types
- caps the body at 2 MB by `Content-Length` and again while streaming
- times out at 12 s

This is the deny-private shape, distinct from `server/attachmentUrl.ts`, which
allowlists our own storage hosts. Different threat, different rule.

`safeFetchHtml` takes an optional `request` transport so the redirect and size
handling can be tested without a network; production always uses the pinned node
transport.

### Public suffixes

`isSameSite` refuses a base host that is really a public suffix. Without that, a
vendor whose website was recorded as `co.uk` would treat every address at every
UK company as its own. `isPublicSuffixLike` is a heuristic — a bare TLD, or a
two-label registry suffix under a ccTLD (`co.uk`, `com.au`, `ne.jp`) — not the
Public Suffix List, which is a large and frequently-updated dataset not worth the
dependency for one check here. The failure is closed either way: an unrecognised
public suffix means values do not verify, never that an unrelated domain is
accepted as the company's own.

`normalizeWebsiteUrl` rejects rather than normalizes anything that should not be
stored as a website — a non-http scheme, embedded credentials, a bare public
suffix — because that value is also written to `vendors.website` and rendered as
a link. On the client, `safeExternalUrl` (in `client/src/lib/utils.ts`) is the
second half of that: a stored value only becomes an `href` or a `window.open`
target if it parses as an absolute `http(s)` URL, and renders as plain text
otherwise.

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

A batch reports three counts, which are not complements of each other:
`verifiedCount` (an own-domain email was found), `unverifiedCount` (everything
else, most of which is a normal outcome — a site publishing only a phone number
is not an error), and `failedCount` (the site could not be read at all).

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
| `server/webFetchGuard.test.ts`         | 63 — address classification (v4 and v6, incl. the transition mechanisms), scheme, DNS, redirect chains into blocked ranges, size caps |
| `server/companyWebsiteSource.test.ts`  | 54 — domain matching, public suffixes, HTML/JSON-LD extraction, patch choice |
| `server/companyContactSourcing.test.ts`| 11 — the promotion rule and existing-value handling |
| `client/src/lib/utils.test.ts`         | 6 — `safeExternalUrl` scheme and shape rejection |

The extraction tests run against HTML fixtures, so they cover the parsing without
any network access.
