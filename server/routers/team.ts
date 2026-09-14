// appRouter.team — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { adminProcedure, createAuditLog } from "./_shared";

// Team Management
export const teamRouter = router({
    // List all team members (admin only)
    list: adminProcedure.query(async () => {
      return db.getTeamMembers();
    }),

    // Get current user's permissions
    myPermissions: protectedProcedure.query(async ({ ctx }) => {
      const permissions = await db.getUserEffectivePermissions(ctx.user.id);
      return {
        role: ctx.user.role,
        permissions,
        linkedVendorId: ctx.user.linkedVendorId,
        linkedWarehouseId: ctx.user.linkedWarehouseId,
      };
    }),

    // Get a specific team member
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getTeamMemberById(input.id);
      }),

    // Update team member role and permissions
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        role: z.enum(['user', 'admin', 'finance', 'ops', 'legal', 'exec', 'copacker', 'vendor', 'contractor']).optional(),
        linkedVendorId: z.number().nullable().optional(),
        linkedWarehouseId: z.number().nullable().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateTeamMember(id, data);
        await createAuditLog(ctx.user.id, 'update', 'user', id);
        return { success: true };
      }),

    // Deactivate team member
    deactivate: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deactivateTeamMember(input.id);
        await createAuditLog(ctx.user.id, 'update', 'user', input.id, undefined, { isActive: true }, { isActive: false });
        return { success: true };
      }),

    // Reactivate team member
    reactivate: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.reactivateTeamMember(input.id);
        await createAuditLog(ctx.user.id, 'update', 'user', input.id, undefined, { isActive: false }, { isActive: true });
        return { success: true };
      }),

    // Set custom permissions for a user
    setPermissions: adminProcedure
      .input(z.object({
        userId: z.number(),
        permissions: z.array(z.string()),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.setUserPermissions(input.userId, input.permissions, ctx.user.id);
        await createAuditLog(ctx.user.id, 'update', 'user_permissions', input.userId);
        return { success: true };
      }),

    // Get user permissions
    getPermissions: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return db.getUserPermissions(input.userId);
      }),
  });
