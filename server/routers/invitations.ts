// appRouter.invitations — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { adminProcedure, createAuditLog } from "./_shared";

// Team Invitations
export const invitationsRouter = router({
    // List all invitations (admin only)
    list: adminProcedure.query(async () => {
      return db.getTeamInvitations();
    }),

    // Create invitation
    create: adminProcedure
      .input(z.object({
        email: z.string().email(),
        role: z.enum(['user', 'admin', 'finance', 'ops', 'legal', 'exec', 'copacker', 'vendor', 'contractor']),
        linkedVendorId: z.number().nullable().optional(),
        linkedWarehouseId: z.number().nullable().optional(),
        customPermissions: z.array(z.string()).optional(),
        expiresInDays: z.number().min(1).max(30).default(7),
      }))
      .mutation(async ({ input, ctx }) => {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);

        const result = await db.createTeamInvitation({
          email: input.email,
          role: input.role,
          invitedBy: ctx.user.id,
          linkedVendorId: input.linkedVendorId,
          linkedWarehouseId: input.linkedWarehouseId,
          customPermissions: input.customPermissions ? JSON.stringify(input.customPermissions) : null,
          expiresAt,
        });

        await createAuditLog(ctx.user.id, 'create', 'team_invitation', result?.id || 0, input.email);

        return result;
      }),

    // Accept invitation (public - user accepting their invite)
    accept: protectedProcedure
      .input(z.object({ inviteCode: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.acceptTeamInvitation(input.inviteCode, ctx.user.id);
        if (result.success) {
          await createAuditLog(ctx.user.id, 'update', 'team_invitation', 0, input.inviteCode);
        }
        return result;
      }),

    // Revoke invitation
    revoke: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.revokeTeamInvitation(input.id);
        await createAuditLog(ctx.user.id, 'update', 'team_invitation', input.id);
        return { success: true };
      }),

    // Check invitation by code (public)
    checkCode: publicProcedure
      .input(z.object({ inviteCode: z.string() }))
      .query(async ({ input }) => {
        const invitation = await db.getTeamInvitationByCode(input.inviteCode);
        if (!invitation) {
          return { valid: false, error: 'Invalid invitation code' };
        }
        if (invitation.status !== 'pending') {
          return { valid: false, error: 'Invitation is no longer valid' };
        }
        if (new Date(invitation.expiresAt) < new Date()) {
          return { valid: false, error: 'Invitation has expired' };
        }
        return {
          valid: true,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        };
      }),
  });
