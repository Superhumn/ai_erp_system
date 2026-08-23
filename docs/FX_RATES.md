# FX rates

Quote comparison converts every bid into one currency. That conversion has to be
defensible months later, so nothing here is guessed and nothing is live-quoted:
every rate is a dated row in `currencyRates` with a recorded source, and
`getFxRate` picks the newest row dated on or before the quote.

## Where a rate comes from

| `source` | Meaning | Overwritten by the feed? |
|---|---|---|
| `manual` | A person typed it — often the rate their bank actually charged. | **No** |
| `ecb_frankfurter` | ECB reference rate pulled from the feed. | Yes |

A typed rate outranks a published one. If someone recorded what the bank
actually gave them, that is better evidence than a reference rate, so
`refreshFxRatesFromFeed` skips those pairs and reports them as `skippedManual`.

## The feed

`server/fxFeed.ts`, pointed at Frankfurter (ECB reference rates) by default.

ECB rather than a live trading feed on purpose: these are published once a day
and carry a date, so "converted at the ECB reference rate published 2026-08-20"
is a claim an auditor can check against a public record. A mid-market snapshot
from a trading API at an unrecorded moment is not. The once-a-day granularity is
the feature.

Set `FX_FEED_URL` to point at a mirror or self-hosted instance. It is fetched
through `server/webFetchGuard.ts` either way — an env var is configuration, not
a trusted input, so it gets the same SSRF check, size cap and timeout as any
other third-party URL.

### Refusing bad data

`parseFeedResponse` writes nothing unless the whole response parses. It requires
a valid `base` matching what was asked for, a `YYYY-MM-DD` date, and a `rates`
object of positive finite numbers within a plausibility band (1e-6 to 1e6). An
HTML error page served with a 200, a feed that quietly changes shape, or a units
mix-up that would multiply a quote by a million all fail loudly instead of
writing a partial set.

Only the `base -> target` direction is stored. `getFxRate` already resolves the
inverse and the USD-triangulated path, so storing both directions would just be
two rows that can disagree.

### Coverage

Frankfurter publishes the ECB's set — roughly 30 currencies. It does **not**
cover CNY, INR, VND, THB or most of what procurement actually buys in. Those are
entered by hand, which is why the paste-in below exists rather than being a
fallback nobody uses.

## Entering rates by hand

`parseRatePaste` reads the shapes people paste out of a bank statement:

```
CNY 7.24            # base -> CNY, base defaults to USD
CNY, 7.24
USD/CNY 7.24
USD -> CNY 7.24
1 EUR = 1.1667 USD
```

Blank lines and `#` comments are skipped. Commas and tabs are separators, never
decimal marks — `25,400` is rejected rather than guessed at.

`currency.importPaste` is all-or-nothing: if any line cannot be read, nothing is
imported and the error names the line. Importing 8 of 10 rates and mentioning it
in a toast is how the other two quietly stay wrong.

## Routes

| Route | Does |
|---|---|
| `currency.feedConfig` | Where the feed points, without calling it |
| `currency.testFeed` | Calls the feed and reports what came back, writing nothing |
| `currency.refreshFromFeed` | Fetches and stores, keeping manual rates |
| `currency.previewPaste` | Parses pasted lines without storing |
| `currency.importPaste` | Stores pasted lines, all-or-nothing |
| `currency.list` / `resolve` / `upsert` / `remove` | The existing single-rate operations |

UI lives in the Currency Rates dialog on the Procurement hub.

## Not done yet

There is no scheduled refresh — `currency.refreshFromFeed` is a button and a
callable route. This repo has no general cron mechanism to hang a daily job on,
so wiring one is a separate decision. Until then someone presses Fetch latest,
or an external scheduler calls the route.

## Tests

| File | Covers |
|---|---|
| `server/fxFeed.test.ts` | 19 — response parsing and every refusal path |
| `server/currencyService.test.ts` | 18 — code normalization, day bucketing, paste parsing |

The fetch itself is not covered end to end: this sandbox blocks outbound HTTPS,
so the feed has never been called against a real response from here. `testFeed`
exists for exactly that reason — run it once from the deployed environment to
confirm the URL, shape and connectivity before relying on the refresh.
