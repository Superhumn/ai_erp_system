// appRouter.users — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { adminProcedure, createAuditLog } from "./_shared";

// ============================================
// USER MANAGEMENT
// ============================================
export const usersRouter = router({
    list: adminProcedure.query(() => db.getAllUsers()),
    updateRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(['user', 'admin', 'finance', 'ops', 'legal', 'exec', 'sales']) }))
      .mutation(async ({ input, ctx }) => {
        await db.updateUserRole(input.userId, input.role);
        await createAuditLog(ctx.user.id, 'update', 'user', input.userId, undefined, undefined, { role: input.role });
        return { success: true };
      }),
    updateProfile: protectedProcedure
      .input(z.object({ name: z.string().optional(), email: z.string().optional(), phone: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const updates: Record<string, string> = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.email !== undefined) updates.email = input.email;
        if (input.phone !== undefined) updates.phone = input.phone;
        if (Object.keys(updates).length > 0) {
          await db.updateUser(ctx.user.id, updates);
        }
        return { success: true };
      }),
    changePassword: protectedProcedure
      .input(z.object({ currentPassword: z.string(), newPassword: z.string().min(6) }))
      .mutation(async ({ input, ctx }) => {
        await db.changeUserPassword(ctx.user.id, input.currentPassword, input.newPassword);
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete yourself" });
        await db.deleteUser(input.userId);
        await createAuditLog(ctx.user.id, 'delete', 'user', input.userId);
        return { success: true };
      }),
  });
