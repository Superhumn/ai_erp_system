// appRouter.currency — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { deleteCurrencyRate, getFxRate, listCurrencyRates, parseRatePaste, upsertCurrencyRate } from "../currencyService";
import { fetchFeedRates, feedBaseUrl, feedUrlIsOverridden, refreshFxRatesFromFeed, FX_FEED_SOURCE } from "../fxFeed";
import { opsProcedure, createAuditLog } from "./_shared";

// ============================================
// CURRENCY RATES (FX basis for quote comparison)
// ============================================
export const currencyRouter = router({
    list: protectedProcedure
      .input(z.object({
        fromCurrency: z.string().length(3).optional(),
        toCurrency: z.string().length(3).optional(),
        limit: z.number().min(1).max(500).optional(),
      }).optional())
      .query(({ input }) => listCurrencyRates(input ?? undefined)),

    // Resolve the rate that would actually be applied, including the inverse and
    // USD-triangulated paths, so a buyer can check a pair before leveling bids.
    resolve: protectedProcedure
      .input(z.object({
        fromCurrency: z.string().length(3),
        toCurrency: z.string().length(3),
        asOf: z.date().optional(),
      }))
      .query(({ input }) => getFxRate(input.fromCurrency, input.toCurrency, input.asOf)),

    upsert: opsProcedure
      .input(z.object({
        fromCurrency: z.string().length(3),
        toCurrency: z.string().length(3),
        rate: z.number().positive(),
        asOf: z.date().optional(),
        source: z.string().max(64).optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await upsertCurrencyRate({ ...input, createdBy: ctx.user.id });
        await createAuditLog(
          ctx.user.id,
          'create',
          'currency_rate',
          result.id,
          `1 ${input.fromCurrency} = ${input.rate} ${input.toCurrency}`,
        );
        return result;
      }),

    remove: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteCurrencyRate(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'currency_rate', input.id);
        return { success: true };
      }),

    // ── ECB reference rates via the configured feed ──
    //
    // Rates a person entered by hand are never overwritten by the feed: if
    // someone typed the rate their bank actually charged, that beats a
    // reference rate. See server/fxFeed.ts.

    /** Where the feed points, without calling it. */
    feedConfig: protectedProcedure.query(() => ({
      url: feedBaseUrl(),
      source: FX_FEED_SOURCE,
      configuredVia: feedUrlIsOverridden() ? 'FX_FEED_URL' : 'default',
    })),

    /**
     * Call the feed and report what came back, writing nothing.
     *
     * This is the one that answers "can this deployment actually reach the
     * feed" — worth running once from the real environment before relying on
     * the scheduled refresh.
     */
    testFeed: opsProcedure
      .input(z.object({ base: z.string().length(3).optional() }).optional())
      .mutation(async ({ input }) => {
        try {
          const feed = await fetchFeedRates({ base: input?.base });
          return {
            ok: true as const,
            url: feedBaseUrl(),
            base: feed.base,
            asOf: feed.asOf,
            currencyCount: Object.keys(feed.rates).length,
            sample: Object.fromEntries(Object.entries(feed.rates).slice(0, 5)),
          };
        } catch (e: any) {
          // A feed that is down is an ordinary answer here, not a 500 — the
          // caller is asking whether it works.
          return {
            ok: false as const,
            url: feedBaseUrl(),
            error: e?.message ?? 'Feed request failed',
            detail: e?.detail,
          };
        }
      }),

    refreshFromFeed: opsProcedure
      .input(z.object({
        base: z.string().length(3).optional(),
        symbols: z.array(z.string().length(3)).max(50).optional(),
        asOf: z.date().optional(),
      }).optional())
      .mutation(async ({ input, ctx }) => {
        const result = await refreshFxRatesFromFeed({ ...(input ?? {}), createdBy: ctx.user.id });
        await createAuditLog(
          ctx.user.id, 'update', 'currency_rate', 0,
          `Stored ${result.written.length} ${result.base} rates from the FX feed`
            + ` as of ${result.asOf.toISOString().slice(0, 10)}`
            + (result.skippedManual.length ? `; kept ${result.skippedManual.length} manual` : ''),
        );
        return result;
      }),

    /**
     * Read pasted rate lines without storing anything, so the client can show
     * what was understood before the user commits to it.
     */
    previewPaste: protectedProcedure
      .input(z.object({ text: z.string().max(20000), base: z.string().length(3).optional() }))
      .query(({ input }) => parseRatePaste(input.text, { base: input.base })),

    /** Store pasted rates. Refuses the whole paste if any line is unreadable. */
    importPaste: opsProcedure
      .input(z.object({
        text: z.string().max(20000),
        base: z.string().length(3).optional(),
        asOf: z.date().optional(),
        notes: z.string().max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const parsed = parseRatePaste(input.text, { base: input.base });
        if (parsed.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nothing to import.' });
        }
        // All-or-nothing: importing 8 of 10 rates and reporting it in a toast is
        // how two of them quietly stay wrong.
        const bad = parsed.filter(r => r.error);
        if (bad.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${bad.length} line(s) could not be read; nothing was imported. `
              + bad.slice(0, 3).map(b => `line ${b.line}: ${b.error}`).join('; '),
          });
        }

        // One timestamp for the whole paste. Letting each row default to "now"
        // independently would split a paste that straddles UTC midnight across
        // two different as-of days.
        const asOf = input.asOf ?? new Date();

        const stored: Array<{ pair: string; rate: number }> = [];
        for (const row of parsed) {
          await upsertCurrencyRate({
            fromCurrency: row.fromCurrency!,
            toCurrency: row.toCurrency!,
            rate: row.rate!,
            asOf,
            source: 'manual',
            notes: input.notes,
            createdBy: ctx.user.id,
          });
          stored.push({ pair: `${row.fromCurrency}->${row.toCurrency}`, rate: row.rate! });
        }
        await createAuditLog(
          ctx.user.id, 'create', 'currency_rate', 0,
          `Imported ${stored.length} FX rates by hand`,
        );
        return { stored, count: stored.length };
      }),
  });
