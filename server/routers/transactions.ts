// appRouter.transactions — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { MAX_PAGE_LIMIT, TRANSACTION_SORTS } from "../listPaging";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { scopeAllows } from "../_core/scope";
import { financeProcedure, resolveRequestScope, assertNonEmptyScope, createAuditLog, generateNumber } from "./_shared";

// ============================================
export const transactionsRouter = router({
    list: financeProcedure
      .input(z.object({
        type: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ input, ctx }) =>
        db.getTransactions(assertNonEmptyScope(await resolveRequestScope(ctx.user)), { type: input?.type, status: input?.status }),
      ),
    // One page (most recent date first) plus the total for the same filters.
    listPaged: financeProcedure
      .input(z.object({
        type: z.string().optional(),
        status: z.string().optional(),
        cogsOnly: z.boolean().optional(),
        sortBy: z.enum(TRANSACTION_SORTS).optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
        offset: z.number().int().min(0).optional(),
      }).optional())
      .query(async ({ input, ctx }) =>
        db.getTransactionsPaged(assertNonEmptyScope(await resolveRequestScope(ctx.user)), input ?? {}),
      ),
    create: financeProcedure
      .input(z.object({
        companyId: z.number().optional(),
        type: z.enum(['journal', 'invoice', 'payment', 'expense', 'transfer', 'adjustment']),
        date: z.date(),
        description: z.string().optional(),
        totalAmount: z.string(),
        currency: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Can't create a transaction under an entity the caller doesn't have access to.
        if (input.companyId != null) {
          const scope = await resolveRequestScope(ctx.user);
          if (!scopeAllows(scope, input.companyId)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot create a transaction under an entity outside your access.' });
          }
        }
        // Default to the caller's home entity so scoped users can see the row they just created.
        const companyId = input.companyId ?? ctx.user.companyId ?? undefined;
        const transactionNumber = generateNumber('TXN');
        const result = await db.createTransaction({ ...input, companyId, transactionNumber, createdBy: ctx.user.id });
        await createAuditLog(ctx.user.id, 'create', 'transaction', result.id, transactionNumber);
        return result;
      }),
  });
