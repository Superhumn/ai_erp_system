// appRouter.cashForecast — rolling 13-week cash forecast (finance roles, entity-scoped).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { adminProcedure, financeProcedure } from "./middleware";
import { resolveRequestScope, assertNonEmptyScope } from "./_shared";
import { scopeAllows } from "../_core/scope";
import { validateChannelTarget } from "../cashNotifyService";
import {
  forecastToPdf,
  forecastToXlsx,
  getCashForecast,
  runCashDigest,
  sendTestToChannel,
  getCollectionsQueue,
  getForecastAccuracy,
  loadBankCashForScope,
  runCashForecastAlerts,
  scopeKeyFor,
  sendCollectionReminder,
  snapshotForecast,
} from "../cashForecastService";

const adjustmentSchema = z.object({
  label: z.string().max(200),
  amount: z.number().positive().max(1e12),
  direction: z.enum(["in", "out"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const knobsSchema = z.object({
  arSlipDays: z.number().int().min(-90).max(180).optional(),
  arHaircutPct: z.number().min(0).max(100).optional(),
  apSlipDays: z.number().int().min(-90).max(180).optional(),
  excludeCustomerIds: z.array(z.number().int()).max(200).optional(),
});

const forecastInput = z
  .object({
    weeks: z.number().int().min(4).max(26).optional(),
    startingCashOverride: z.number().finite().nullable().optional(),
    adjustments: z.array(adjustmentSchema).max(100).optional(),
    knobs: knobsSchema.optional(),
    scenarioId: z.number().int().optional(),
    includePipeline: z.boolean().optional(),
    includeProjects: z.boolean().optional(),
  })
  .optional();

const frequency = z.enum(["weekly", "biweekly", "monthly", "quarterly", "annually"]);

const expenseInput = z.object({
  name: z.string().min(1).max(255),
  category: z.string().max(64).default("other"),
  vendorId: z.number().int().nullable().optional(),
  amount: z.number().positive().max(1e12),
  currency: z.string().length(3).default("USD"),
  frequency,
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
});

const scenarioParams = z.object({
  startingCashOverride: z.number().finite().nullable().optional(),
  arSlipDays: knobsSchema.shape.arSlipDays,
  arHaircutPct: knobsSchema.shape.arHaircutPct,
  apSlipDays: knobsSchema.shape.apSlipDays,
  excludeCustomerIds: knobsSchema.shape.excludeCustomerIds,
  adjustments: z.array(adjustmentSchema).max(100).optional(),
});

async function scopeFor(user: Parameters<typeof resolveRequestScope>[0]) {
  return assertNonEmptyScope(await resolveRequestScope(user));
}

function homeCompany(user: { companyId: number | null }, scope: { companyIds: number[] | "all" }) {
  if (user.companyId) return user.companyId;
  return scope.companyIds !== "all" && scope.companyIds.length === 1 ? scope.companyIds[0] : null;
}

async function resolveForecastParams(scope: Awaited<ReturnType<typeof scopeFor>>, input: z.infer<typeof forecastInput>) {
  let startingCashOverride = input?.startingCashOverride ?? null;
  let adjustments = input?.adjustments ?? [];
  let knobs = input?.knobs;
  if (input?.scenarioId) {
    const sc = await db.getCashForecastScenarioById(input.scenarioId);
    if (!sc || !scopeAllows(scope, sc.companyId)) throw new TRPCError({ code: "NOT_FOUND", message: "Scenario not found" });
    const p = sc.params ?? {};
    if (startingCashOverride == null && typeof p.startingCashOverride === "number") startingCashOverride = p.startingCashOverride;
    adjustments = [...(p.adjustments ?? []), ...adjustments];
    knobs = { arSlipDays: p.arSlipDays, arHaircutPct: p.arHaircutPct, apSlipDays: p.apSlipDays, excludeCustomerIds: p.excludeCustomerIds, ...(knobs ?? {}) };
  }
  return { scope, weeks: input?.weeks, startingCashOverride, adjustments, knobs, includePipeline: input?.includePipeline, includeProjects: input?.includeProjects };
}

const channelType = z.enum(["slack", "google_chat", "whatsapp", "email", "webhook"]);

export const cashForecastRouter = router({
  get: financeProcedure.input(forecastInput).query(async ({ ctx, input }) => {
    const scope = await scopeFor(ctx.user);
    return getCashForecast(await resolveForecastParams(scope, input));
  }),

  export: financeProcedure.input(forecastInput).mutation(async ({ ctx, input }) => {
    const scope = await scopeFor(ctx.user);
    return forecastToXlsx(await getCashForecast(await resolveForecastParams(scope, input)));
  }),

  exportPdf: financeProcedure.input(forecastInput).mutation(async ({ ctx, input }) => {
    const scope = await scopeFor(ctx.user);
    const forecast = await getCashForecast(await resolveForecastParams(scope, input));
    const companies = await db.getCompanies();
    const home = ctx.user.companyId ? companies.find((c) => c.id === ctx.user.companyId) : undefined;
    return forecastToPdf(forecast, { companyName: home?.name ?? "Superhumn", preparedBy: ctx.user.name ?? ctx.user.email ?? undefined });
  }),

  // ── Notification channels (digest + alerts) ──
  channels: router({
    list: financeProcedure.query(async ({ ctx }) => {
      const scope = await scopeFor(ctx.user);
      return db.getCashNotificationChannels(scopeKeyFor(scope));
    }),
    create: financeProcedure
      .input(z.object({ type: channelType, target: z.string().min(1).max(1024), label: z.string().max(120).nullable().optional(), sendDigest: z.boolean().default(true), sendAlerts: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
        const err = validateChannelTarget(input.type, input.target);
        if (err) throw new TRPCError({ code: "BAD_REQUEST", message: err });
        const scope = await scopeFor(ctx.user);
        return db.createCashNotificationChannel({ ...input, target: input.target.trim(), scopeKey: scopeKeyFor(scope), companyId: homeCompany(ctx.user, scope), createdBy: ctx.user.id });
      }),
    update: financeProcedure
      .input(z.object({ id: z.number().int(), label: z.string().max(120).nullable().optional(), sendDigest: z.boolean().optional(), sendAlerts: z.boolean().optional(), isActive: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const scope = await scopeFor(ctx.user);
        const row = await db.getCashNotificationChannelById(input.id);
        if (!row || row.scopeKey !== scopeKeyFor(scope)) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
        const { id, ...data } = input;
        await db.updateCashNotificationChannel(id, data);
        return { ok: true };
      }),
    delete: financeProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const scope = await scopeFor(ctx.user);
      const row = await db.getCashNotificationChannelById(input.id);
      if (!row || row.scopeKey !== scopeKeyFor(scope)) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      await db.deleteCashNotificationChannel(input.id);
      return { ok: true };
    }),
    test: financeProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const scope = await scopeFor(ctx.user);
      const row = await db.getCashNotificationChannelById(input.id);
      if (!row || row.scopeKey !== scopeKeyFor(scope)) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      const r = await sendTestToChannel({ type: row.type, target: row.target }, scope);
      await db.markCashNotificationChannelResult(row.id, r.ok, r.error);
      if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error ?? "Send failed" });
      return { ok: true };
    }),
    runDigestNow: adminProcedure.mutation(async () => runCashDigest()),
  }),

  // ── Recurring expenses ──
  expenses: router({
    list: financeProcedure.query(async ({ ctx }) => db.getRecurringExpenses(await scopeFor(ctx.user))),
    create: financeProcedure.input(expenseInput).mutation(async ({ ctx, input }) => {
      const scope = await scopeFor(ctx.user);
      return db.createRecurringExpense({
        ...input,
        amount: String(input.amount),
        nextDate: new Date(`${input.nextDate}T00:00:00Z`),
        endDate: input.endDate ? new Date(`${input.endDate}T00:00:00Z`) : null,
        companyId: homeCompany(ctx.user, scope),
        createdBy: ctx.user.id,
      });
    }),
    update: financeProcedure.input(z.object({ id: z.number().int(), data: expenseInput.partial() })).mutation(async ({ ctx, input }) => {
      const scope = await scopeFor(ctx.user);
      const row = await db.getRecurringExpenseById(input.id);
      if (!row || !scopeAllows(scope, row.companyId)) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
      const d = input.data;
      await db.updateRecurringExpense(input.id, {
        ...d,
        amount: d.amount != null ? String(d.amount) : undefined,
        nextDate: d.nextDate ? new Date(`${d.nextDate}T00:00:00Z`) : undefined,
        endDate: d.endDate === undefined ? undefined : d.endDate ? new Date(`${d.endDate}T00:00:00Z`) : null,
      });
      return { ok: true };
    }),
    delete: financeProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const scope = await scopeFor(ctx.user);
      const row = await db.getRecurringExpenseById(input.id);
      if (!row || !scopeAllows(scope, row.companyId)) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
      await db.deleteRecurringExpense(input.id);
      return { ok: true };
    }),
  }),

  // ── Scenarios ──
  scenarios: router({
    list: financeProcedure.query(async ({ ctx }) => db.getCashForecastScenarios(await scopeFor(ctx.user))),
    create: financeProcedure
      .input(z.object({ name: z.string().min(1).max(120), description: z.string().max(2000).nullable().optional(), params: scenarioParams }))
      .mutation(async ({ ctx, input }) => {
        const scope = await scopeFor(ctx.user);
        return db.createCashForecastScenario({ ...input, companyId: homeCompany(ctx.user, scope), createdBy: ctx.user.id });
      }),
    update: financeProcedure
      .input(z.object({ id: z.number().int(), name: z.string().min(1).max(120).optional(), description: z.string().max(2000).nullable().optional(), params: scenarioParams.optional() }))
      .mutation(async ({ ctx, input }) => {
        const scope = await scopeFor(ctx.user);
        const row = await db.getCashForecastScenarioById(input.id);
        if (!row || !scopeAllows(scope, row.companyId)) throw new TRPCError({ code: "NOT_FOUND", message: "Scenario not found" });
        const { id, ...data } = input;
        await db.updateCashForecastScenario(id, data);
        return { ok: true };
      }),
    delete: financeProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
      const scope = await scopeFor(ctx.user);
      const row = await db.getCashForecastScenarioById(input.id);
      if (!row || !scopeAllows(scope, row.companyId)) throw new TRPCError({ code: "NOT_FOUND", message: "Scenario not found" });
      await db.deleteCashForecastScenario(input.id);
      return { ok: true };
    }),
  }),

  // ── Snapshots & accuracy ──
  snapshot: financeProcedure.mutation(async ({ ctx }) => snapshotForecast(await scopeFor(ctx.user), "manual", ctx.user.id)),
  accuracy: financeProcedure.query(async ({ ctx }) => getForecastAccuracy(await scopeFor(ctx.user))),

  // ── Bank account → entity mapping (admin) ──
  bankAccounts: router({
    list: adminProcedure.query(async () => {
      const [bank, map, companies] = await Promise.all([
        loadBankCashForScope({ mode: "global", companyIds: "all" }),
        db.getBankAccountEntityMap(),
        db.getCompanies(),
      ]);
      const byId = new Map(map.map((m) => [m.externalAccountId, m.companyId]));
      return {
        configured: bank.configured,
        error: bank.error,
        accounts: bank.accounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance, companyId: byId.get(a.id) ?? null })),
        companies: companies.map((c) => ({ id: c.id, name: c.name })),
      };
    }),
    set: adminProcedure
      .input(z.object({ externalAccountId: z.string().min(1).max(128), accountName: z.string().max(256).nullable().optional(), companyId: z.number().int().nullable() }))
      .mutation(async ({ input }) => {
        await db.setBankAccountEntity({ externalAccountId: input.externalAccountId, accountName: input.accountName ?? null, companyId: input.companyId ?? null });
        return { ok: true };
      }),
  }),

  // ── Alerts ──
  alerts: router({
    get: financeProcedure.query(async ({ ctx }) => {
      const scope = await scopeFor(ctx.user);
      const row = await db.getCashForecastAlertSettings(scopeKeyFor(scope));
      return row
        ? { thresholdAmount: Number(row.thresholdAmount), recipients: row.recipients, isActive: row.isActive, lastAlertedAt: row.lastAlertedAt, lastAlertLowestCash: row.lastAlertLowestCash != null ? Number(row.lastAlertLowestCash) : null }
        : null;
    }),
    set: financeProcedure
      .input(z.object({ thresholdAmount: z.number().finite(), recipients: z.array(z.string().email()).min(1).max(20), isActive: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
        const scope = await scopeFor(ctx.user);
        return db.upsertCashForecastAlertSettings({
          scopeKey: scopeKeyFor(scope),
          companyId: homeCompany(ctx.user, scope),
          thresholdAmount: String(input.thresholdAmount),
          recipients: input.recipients,
          isActive: input.isActive,
          updatedBy: ctx.user.id,
        });
      }),
    runNow: adminProcedure.mutation(async () => runCashForecastAlerts()),
  }),

  // ── Collections ──
  collections: router({
    queue: financeProcedure.query(async ({ ctx }) => getCollectionsQueue(await scopeFor(ctx.user))),
    remind: financeProcedure.input(z.object({ invoiceId: z.number().int() })).mutation(async ({ ctx, input }) => {
      const scope = await scopeFor(ctx.user);
      const res = await sendCollectionReminder(scope, input.invoiceId, { replyTo: ctx.user.email ?? undefined });
      if (!res.success) throw new TRPCError({ code: "BAD_REQUEST", message: res.error ?? "Could not send reminder" });
      return res;
    }),
  }),
});
