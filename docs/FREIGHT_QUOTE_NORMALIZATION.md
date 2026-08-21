# Freight Quote Normalization

How a carrier's rate reply becomes a comparable number.

This is the freight counterpart to
[`QUOTE_NORMALIZATION.md`](./QUOTE_NORMALIZATION.md). The shape is the same —
extract with a model, compute deterministically, let the model narrate the
computed numbers rather than produce them — but freight has two comparison axes
that material quotes do not.

---

## The pipeline

```
carrier reply (email body and/or attached rate sheet)
      │
      ├─ extract     server/freightQuoteParser.ts          → structured fields (LLM)
      ├─ persist     freightEmails + freightQuotes rows
      └─ normalize   server/freightQuoteNormalization.ts   → landed cost (deterministic)
                            │
                            └─ AI analysis scores and narrates on top
```

Entry points, both in `freight.emails.parseIncoming` and mirrored in
`server/routers/freight.ts`:

- **Email body** — `parseFreightQuoteEmail`
- **Attachment** — `parseFreightQuoteAttachment`, reusing
  `buildDocumentMessageContent` so a scanned rate sheet goes through the same
  pdfjs → OCR fallback as every other document

When both are present the attachment wins field-by-field: if a carrier sends a
covering mail and a rate sheet, the sheet is the binding document. A failed
attachment parse never discards the body extraction already in hand.

---

## What the landed cost is

```
landed total = freight + surcharges the carrier quoted
             + allowances for legs the carrier's service scope excludes
             + insurance on declared value where the carrier does not carry it
             + customs clearance where required and not quoted
             → converted to the RFQ's base currency at a dated FX rate
```

`costPerChargeableKg` divides that by the weight that will actually be billed —
see below.

---

## The two freight-specific axes

### Chargeable weight

Carriers bill on `max(actual weight, volumetric weight)`. A carrier quoting
per-kg against actual weight on light, bulky cargo is quoting a number that will
not survive first tender.

Volumetric weight comes from a divisor that depends on the mode:

| Mode | kg per CBM | Why |
|---|---|---|
| `air` | 167 | IATA 6000 cm³/kg |
| `express` | 200 | Courier 5000 cm³/kg |
| `ocean_lcl` | 1000 | W/M — a revenue ton is 1 CBM or 1000 kg |
| `ground` | 333 | European road groupage convention |
| `ocean_fcl`, `rail` | — | Priced per container/wagon; no volumetric comparison |

`freightRfqs.dimFactorKgPerCbm` overrides the mode default when a lane is
contracted on a different divisor. When a carrier states its own chargeable
weight more than 2% below the computed one, that is flagged — it is the most
common reason a quote grows after booking.

### Service scope

Port-to-port against door-to-door is the freight version of EXW against DDP.
`SCOPE_COVERAGE` maps each scope to the legs it includes; missing legs are
priced from the RFQ's allowances (`originHaulageAllowance`,
`destinationHaulageAllowance`, `customsClearanceAllowance`).

Two details worth knowing:

- **An unparsed or missing scope is read as port-to-port**, the conservative
  reading, so gaps surface rather than being assumed away.
- **A leg the carrier itemised is treated as covered** even when the scope label
  says otherwise, so an origin charge on a "port-to-port" quote is not
  double-counted against the origin allowance.

Main carriage has no allowance. A quote that excludes it is not a freight quote,
and inventing a number for the largest line on the invoice would be worse than
saying nothing.

---

## What it refuses to do

Both refusals are deliberate and carried over from the vendor side:

- **A quote whose currency has no rate on file is marked not-comparable and
  excluded from the ranking.** It is never compared as though the numbers were
  already in base currency. Add a rate under Currency Rates and re-level.
- **An unfunded scope gap is reported, not guessed.** The landed cost comes back
  with `scope_gap_unpriced` flagged as understating cost rather than carrying an
  invented allowance.

A third case is specific to freight: when a carrier's headline total exceeds the
sum of its named charges, the difference is carried as an unitemised adder and
flagged. The carrier will invoice it.

---

## Where the model still sits

`freight.quotes.analyzeQuotes` runs normalization first and hands the model the
computed numbers as authoritative. The model contributes a score, pros and cons,
and a rationale. It does not produce costs.

Its recommendation is only accepted if it maps to a real quote on the RFQ that
survived normalization; otherwise the computed cheapest stands, and the response
says which via `recommendationSource`.

`freight.quotes.normalizeQuotes` runs the deterministic pass alone, so the UI can
re-level after an FX rate or allowance changes without paying for an analysis
pass.

---

## Warning codes

| Code | Understates cost | Meaning |
|---|---|---|
| `fx_rate_unavailable` | — | No rate on file; excluded from ranking |
| `missing_freight_cost` | yes | No freight cost or total on the quote |
| `scope_missing` / `scope_unparsed` | — | Scope read as port-to-port |
| `scope_gap_unpriced` | yes | A required leg is neither quoted nor allowed for |
| `total_disagrees_with_components` | — | Headline total ≠ sum of named charges |
| `volumetric_governs` | — | Billing is on volume, not actual weight |
| `chargeable_weight_unknown` | — | No usable weight or volume on the RFQ |
| `carrier_chargeable_weight_differs` | if lower | Carrier's stated weight ≠ computed |
| `insurance_not_carried` | yes | Cover required, not quoted, not estimable |
| `quote_expired` | — | Validity lapsed |
| `transit_exceeds_requirement` | — | Schedule miss; not priced |

---

## Not covered

- **`freight_quotes` (the standalone table)** — a separate simplified quoting
  flow used by `CarrierQuotes.tsx`, with its own `quotedPrice`/`currency` columns.
  It is not normalized. Quotes raised against a `freightRfqs` record are.
- **Carrier responsiveness** — `freightCarriers.rating` is still a manually
  maintained field. There is no `freightRfqInvitations` table, so the measured
  treatment given to vendors in `server/vendorResponsiveness.ts` has no
  equivalent here yet; it would need to derive from `freightEmails` direction
  and timing.
