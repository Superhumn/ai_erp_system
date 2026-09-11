// appRouter.companies — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { adminProcedure, createAuditLog } from "./_shared";

// ============================================
// COMPANY MANAGEMENT
// ============================================
export const companiesRouter = router({
    list: protectedProcedure.query(() => db.getCompanies()),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getCompanyById(input.id)),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        legalName: z.string().optional(),
        taxId: z.string().optional(),
        type: z.enum(['parent', 'subsidiary', 'branch']).optional(),
        parentCompanyId: z.number().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        industry: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createCompany(input);
        await createAuditLog(ctx.user.id, 'create', 'company', result.id, input.name);
        return result;
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        legalName: z.string().optional(),
        taxId: z.string().optional(),
        status: z.enum(['active', 'inactive', 'pending']).optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateCompany(id, data);
        await createAuditLog(ctx.user.id, 'update', 'company', id);
        return { success: true };
      }),
    // Lightweight: entity metadata + active-employee headcounts only.
    // Safe for any authenticated role (incl. investor/vendor/contractor)
    // because it doesn't expose individual employee identities.
    structure: protectedProcedure.query(() => db.getCompanyStructureSummary()),
    // Full roster (names, emails, titles). Gated to internal roles —
    // external roles (investor/vendor/contractor/copacker) get FORBIDDEN.
    structureWithRoster: protectedProcedure.query(({ ctx }) => {
      const external = new Set(["investor", "vendor", "contractor", "copacker"]);
      if (external.has(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "The employee directory is only available to internal team members.",
        });
      }
      return db.getCompanyStructure();
    }),
  });
