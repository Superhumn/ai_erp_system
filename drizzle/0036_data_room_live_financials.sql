-- Migration 0036: live current-financials page for data rooms.
--
-- Adds two per-room toggles that gate an investor-facing, live (JSON-driven)
-- financials page (`/dr/:code/financials`). This is deliberately distinct
-- from the frozen projections snapshot flow: the page computes metrics at
-- request time against current cash, invoice, and expense data, rather than
-- reading a cached HTML blob.
--
-- Defaults are OFF on every existing room, so the feature ships dark until a
-- room owner flips `showLiveFinancials` on a per-room basis.

ALTER TABLE `data_rooms`
  ADD COLUMN `showLiveFinancials` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN `liveFinancialsIncludeAr` tinyint(1) NOT NULL DEFAULT 0;
