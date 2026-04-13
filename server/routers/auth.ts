import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import * as db from "../db";
import { router, publicProcedure, protectedProcedure, adminProcedure, createAuditLog } from "./middleware";

export const authRouter = router({
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  // ============================================
  // USER MANAGEMENT
  // ============================================
  users: router({
    list: adminProcedure.query(() => db.getAllUsers()),
    updateRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(['user', 'admin', 'finance', 'ops', 'legal', 'exec']) }))
      .mutation(async ({ input, ctx }) => {
        await db.updateUserRole(input.userId, input.role);
        await createAuditLog(ctx.user.id, 'update', 'user', input.userId, undefined, undefined, { role: input.role });
        return { success: true };
      }),
  }),
  // ============================================
  // COMPANY MANAGEMENT
  // ============================================
  companies: router({
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
  }),
});
