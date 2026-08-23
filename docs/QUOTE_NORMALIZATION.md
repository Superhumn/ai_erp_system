# Vendor Quote Normalization & Responsiveness

How an inbound supplier quotation becomes a comparable number, and how vendor
responsiveness is measured rather than guessed.

Related: [`VENDOR_QUOTE_WORKFLOW.md`](./VENDOR_QUOTE_WORKFLOW.md) (the RFQ →
quote → award workflow), [`EMAIL_INTAKE.md`](./EMAIL_INTAKE.md) (the mailbox
scanner that feeds it).

---

## The pipeline

```
supplier reply (email body and/or attached quote sheet)
      │
      ├─ classify           server/_core/emailParser.ts        → category "vendor_quote"
      ├─ extract            server/vendorQuoteParser.ts        → structured fields (LLM)
      ├─ match              vendor by email/domain, RFQ by number or open invitation
      ├─ persist            vendorRfqEmails + vendorQuotes rows
      ├─ record response    server/vendorResponsiveness.ts     → first-response time
      └─ normalize          server/quoteNormalization.ts       → landed cost (deterministic)
                                    │
                                    └─ AI bid leveling narrates scope deviations on top
```

Extraction is the only LLM step. Everything after it — matching, arithmetic,
ranking — is deterministic so an award decision can be defended line by line.

---

## Normalization: putting quotes on one basis

`server/quoteNormalization.ts` computes, per quote:

```
landed total = goods at the billable quantity
             + charges the vendor quoted (shipping, handling, insurance, duty, tax, other)
             + allowances for cost buckets the vendor's Incoterm leaves with the buyer
             + tooling / NRE amortized over the program volume
             → converted to the RFQ's base currency at a dated FX rate
```

`landedUnitCost` divides that by the quantity the RFQ actually needs, so an MOQ
over-buy shows up as a worse unit cost rather than disappearing.

### The comparison basis

Set per RFQ (columns on `vendorRfqs`, editable in the Create RFQ dialog):

| Field | Meaning | Default |
|---|---|---|
| `baseCurrency` | Currency all quotes convert into | `USD` |
| `targetIncoterms` | Delivery basis quotes are topped up to | `DDP` |
| `freightAllowancePerUnit` / `freightAllowancePct` | Fills an unpriced logistics gap | none |
| `dutyRatePct` | Import duty, rated on CIF value | none |
| `insuranceRatePct` | Cargo insurance, rated on goods + freight | none |
| `amortizeToolingOverUnits` | Program volume for NRE amortization | this order only |

### Incoterms

`INCOTERM_COVERAGE` encodes Incoterms 2020 seller obligations across five
buckets: origin handling, main carriage, insurance, import clearance,
destination delivery. `incotermGaps(quoted, target)` returns the buckets the
target requires that the quote does not cover, and each gap is priced from the
RFQ's allowance rates.

Two deliberate behaviours:

- A vendor that quoted an explicit shipping line is **not** charged a freight
  allowance on top of it — the quoted line stands in for the gap.
- The logistics buckets share one door-to-door freight allowance, because buyers
  configure a single rate rather than a rate per leg.

### MOQ

`billableQuantity = max(required, MOQ)`. Goods are re-priced at the billable
quantity; ancillary charges are taken **as quoted** (they are per-shipment
amounts), and a `quantity_basis_mismatch` warning fires when the vendor priced a
materially different quantity.

### Tooling / NRE

Amortized over `quote.toolingAmortizationUnits` → `rfq.amortizeToolingOverUnits`
→ this order's billable quantity, in that order. Falling through to the last
option raises `tooling_amortized_over_order_only`, because charging a mould to a
single order overstates unit cost when it serves future orders. Tooling marked
refundable is excluded from landed cost and flagged.

### Currency

`server/currencyService.ts` resolves a pair as identity → direct → inverse →
USD-triangulated, always picking the newest rate dated **on or before** the
quote, so historical quotes convert at the rate that was current when they
arrived. The rate, its as-of date and its provenance are stored beside the
converted number (`fxRate`, `fxRateAsOf`, `fxRateSource`).

**A quote in a currency with no rate on file is marked `comparable: false` and
excluded from the ranking.** It is never compared as if the numbers were already
in the base currency. Add rates via the *FX rates* dialog in Procurement Hub, or
`currency.upsert`.

### Warnings

Every computation records what it could not price honestly. Warnings carrying
`understatesCost: true` mean the landed cost is a floor, not an estimate:

`fx_rate_unavailable` · `missing_unit_price` · `missing_quantity` ·
`quantity_basis_mismatch` · `moq_above_requirement` · `incoterm_missing` ·
`incoterm_unparsed` · `incoterm_gap_unpriced` ·
`tooling_amortized_over_order_only` · `refundable_tooling_excluded` ·
`quote_expired`

### Where the AI fits

`vendorQuotes.quotes.levelBids` runs normalization **first**, hands the computed
landed costs to the model as authoritative, and takes back only scope
deviations, a rationale and a score. The persisted `leveledTotalCost` is the
computed number, not the model's echo of it, and a recommendation for a
non-comparable quote is rejected in favour of the computed best.

---

## Responsiveness

`server/vendorResponsiveness.ts` derives everything from
`vendorRfqInvitations` — when we invited a vendor, when they first replied, and
whether the reply beat the quote due date.

- `recordInvitationResponse` stamps `firstResponseHours` and
  `respondedBeforeDueDate` when a quote lands. A revised quote does **not** reset
  the clock; responsiveness measures the first reply.
- `markStaleInvitationsNoResponse` closes invitations past their due date plus a
  grace period as `no_response`. Without it, silent vendors sit as "sent" forever
  and never register as unresponsive. The monthly supplier-performance workflow
  runs this before measuring.
- `responsivenessScoreFromMetrics` weights **50%** response rate (a prompt
  decline counts as answering), **30%** first-reply speed (100 at ≤24h, decaying
  to 0 at ≥14 days), **20%** replies before the due date. With no due dates on
  record, the on-time weight folds into the response rate rather than scoring an
  unknown as a failure.

The score is `null` — not a flattering default — when there is nothing to
measure. `supplierScoringService` overwrites the model's responsiveness
judgement with this computed value and re-weights the overall score to match;
the monthly rollup writes it to `supplierPerformance.responsiveScore`,
`averageResponseTimeHours` and the `rfq*` counters.

---

## API surface

All under the live router (`server/routers.ts`).

| Procedure | What it does |
|---|---|
| `vendorQuotes.quotes.normalize` | Recompute + persist landed costs for an RFQ (no LLM) |
| `vendorQuotes.quotes.comparison` | Read-only side-by-side payload for the UI |
| `vendorQuotes.quotes.levelBids` | Normalization + AI scope-deviation narrative |
| `vendorQuotes.emails.parseIncoming` | Ingest a supplier reply into a quote |
| `vendorQuotes.emails.previewEmail` / `previewAttachment` | Extract without writing |
| `vendorQuotes.responsiveness.byVendor` / `leaderboard` | Measured metrics + score |
| `vendorQuotes.responsiveness.closeStaleInvitations` | Close overdue invitations |
| `currency.list` / `resolve` / `upsert` / `remove` | FX rate management |

Normalization also runs automatically after quote entry, quote edit, and inbound
email ingestion, so ranks never go stale behind a changed rate or allowance.

---

## Schema

Migration `drizzle/0057_quote_normalization_and_responsiveness.sql`:

- **`currencyRates`** — `fromCurrency`, `toCurrency`, `rate`, `asOf`, `source`
- **`vendorRfqs`** — the comparison-basis columns listed above
- **`vendorQuotes`** — quoted terms (`incoterms`, `namedPlace`, `insuranceCost`,
  `customsDutyAmount`, `toolingCost`, `toolingAmortizationUnits`,
  `toolingIsRefundable`) and computed outputs (`normalizedCurrency`, `fxRate`,
  `fxRateAsOf`, `fxRateSource`, `landedUnitCost`, `landedTotalCost`,
  `billableQuantity`, `moqShortfallUnits`, `toolingPerUnit`,
  `normalizationBreakdown`, `normalizationWarnings`, `normalizedRank`,
  `normalizedAt`)
- **`vendorRfqInvitations`** — `firstResponseHours`, `respondedBeforeDueDate`, `closedAt`
- **`vendors`** — `defaultCurrency`, `defaultIncoterms` (normalization fallbacks)
- **`supplierPerformance`** — `rfqsInvited`, `rfqsResponded`, `rfqsDeclined`,
  `rfqsNoResponse`, `rfqResponseRatePct`, `onTimeQuoteRatePct`
- **`email_category`** enum — adds `vendor_quote`, plus `inventory_report`,
  `hr_recruiting` and `legal`, which the classifier already emitted but the enum
  rejected on write

---

## Worked example

An RFQ for 10,000 units, base USD, leveled to DDP, freight allowance $0.15/unit,
duty 6%, insurance 0.5%, tooling amortized over 100,000 units:

| Vendor | Quoted | Terms | Landed total | Rank |
|---|---|---|---|---|
| A | €1.00/unit | EXW, MOQ 12,000, €8,000 tooling | **$16,914.03** | 3 |
| B | $1.35/unit | DDP | **$13,500.00** | 1 |
| C | $1.40/unit | FOB | **$16,512.15** | 2 |

The cheapest sticker price is the most expensive bid. This case is pinned in
`server/quoteNormalization.test.ts`.
