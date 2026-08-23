# Ocean Rate Estimator

Instant indicative pricing for a sea shipment, so someone can enter shipment details
and see the likely all-in cost before going out for a forwarder RFQ.

**Route:** `/freight/rate-estimator` (linked from the Freight dashboard and Logistics hub)

## Where the numbers come from

The Superhumn ocean freight matrix, as of **9 August 2026**, USD, port-to-port.
45 lanes across 7 origin countries (India, Malaysia, Singapore, Indonesia, Vietnam,
China, South Africa) and 9 destinations.

All rates are market indications, not quotes:

- Spot rates move 20–40% within a quarter.
- Contract rates typically price 10–25% below the spot figures shown.
- Lanes marked `interpolated` had no carrier indicative rate and were derived from the
  nearest benchmarked lane. The estimator flags these in the UI.

## Files

| File | Role |
|------|------|
| `shared/oceanFreightRates.ts` | The matrix, the assumptions, and `estimateOceanFreight()`. Single source of truth. |
| `server/routers.ts` → `freight.rateEstimate.estimate` | tRPC query wrapping the same pure function, for server-side callers. |
| `client/src/pages/freight/RateEstimator.tsx` | The form + live preview. Calls the shared function directly — no round trip. |
| `server/oceanFreightEstimator.test.ts` | Pins the calculation against the sheet's "Cost per lb" tab. |

## The model

```
base freight   = lane low/high band  x  chargeable units  x  rate scenario
peak surcharge = 50% of base (mid) when the sail date falls in Aug–Oct
surcharges     = origin THC + destination THC + BL fee + drayage + insurance
all-in         = base + peak + surcharges
```

- **Chargeable units** — container count for FCL; for LCL the revenue ton, i.e. the
  greater of cbm and metric tonnes.
- **Per-container charges** — origin THC $250, destination THC $300, drayage $800 to a
  US destination and $350 everywhere else. The BL fee ($120) is per shipment.
- **Insurance** — 0.4% of declared cargo value, all-risk. Only added when a value is entered.
- **Cost per lb** — uses the entered gross weight; falls back to the 18,000 kg retort
  payload basis when no weight is given. Retort pouches cube out before they weigh out,
  so that is the conservative default rather than the 26,000 kg dense-goods payload.
- **Capacity checks** — warns when the load exceeds the legal payload or the container
  volume for the chosen mode and container count.

Excludes customs duty and clearance.

## Refreshing rates

Edit `LANES`, `ASSUMPTIONS`, and `SURCHARGES` in `shared/oceanFreightRates.ts`, then bump
`RATES_AS_OF`. The as-of date renders in the page header. `server/oceanFreightEstimator.test.ts`
pins seven lanes against the source sheet — update those expectations in the same change so
the test keeps documenting what the matrix actually says.
