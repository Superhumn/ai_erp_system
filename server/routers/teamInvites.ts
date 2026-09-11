// appRouter.teamInvites — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import { sendEmail } from "../_core/email";
import * as db from "../db";
import { adminProcedure } from "./_shared";

// Team Invites (email-based invite flow)
export const teamInvitesRouter = router({
    list: adminProcedure.query(() => db.getTeamInvites()),
    invite: adminProcedure
      .input(z.object({
        email: z.string().email(),
        name: z.string().optional(),
        role: z.enum(["user", "admin", "finance", "ops", "legal", "exec", "copacker", "vendor", "contractor"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 1. Generate a secure token
        const crypto = await import("crypto");
        const token = crypto.randomBytes(32).toString("hex");

        // 2. Create invite record (expires in 7 days)
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db.createTeamInvite({
          email: input.email.toLowerCase(),
          name: input.name,
          role: input.role || "user",
          invitedBy: ctx.user.id,
          token,
          expiresAt,
        });

        // 3. Send invite email via SendGrid
        try {
          const appUrl = process.env.APP_URL || process.env.PUBLIC_APP_URL || "https://aierpsystem-production.up.railway.app";
          const inviteUrl = `${appUrl}/login?invite=${token}`;

          await sendEmail({
            to: input.email,
            subject: `You've been invited to join Superhumn on the ERP System`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>You're invited!</h2>
                <p>${ctx.user.name || "An admin"} has invited you to join <strong>Superhumn Inc</strong> on the ERP system.</p>
                <p><strong>Role:</strong> ${(input.role || "user").charAt(0).toUpperCase() + (input.role || "user").slice(1)}</p>
                <p>Click the button below to create your account:</p>
                <a href="${inviteUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
                  Accept Invitation
                </a>
                <p style="color: #888; font-size: 14px;">This invitation expires in 7 days.</p>
                <p style="color: #888; font-size: 12px;">If the button doesn't work, copy this link: ${inviteUrl}</p>
              </div>
            `,
          });
        } catch (e) {
          console.warn("[Team Invite] Failed to send email:", e);
          // Still return success - the invite was created, email just failed
        }

        return { success: true, token };
      }),
    cancel: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.updateTeamInvite(input.id, { status: "cancelled" });
        return { success: true };
      }),
    resend: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const invite = await db.getTeamInviteById(input.id);
        if (!invite) throw new TRPCError({ code: "NOT_FOUND" });

        try {
          const appUrl = process.env.APP_URL || process.env.PUBLIC_APP_URL || "https://aierpsystem-production.up.railway.app";
          const inviteUrl = `${appUrl}/login?invite=${invite.token}`;

          await sendEmail({
            to: invite.email,
            subject: `Reminder: You've been invited to join Superhumn on the ERP System`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Reminder: You're invited!</h2>
                <p>${ctx.user.name || "An admin"} has invited you to join <strong>Superhumn Inc</strong> on the ERP system.</p>
                <p><strong>Role:</strong> ${(invite.role).charAt(0).toUpperCase() + (invite.role).slice(1)}</p>
                <p>Click the button below to create your account:</p>
                <a href="${inviteUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
                  Accept Invitation
                </a>
                <p style="color: #888; font-size: 14px;">This invitation expires on ${new Date(invite.expiresAt).toLocaleDateString()}.</p>
                <p style="color: #888; font-size: 12px;">If the button doesn't work, copy this link: ${inviteUrl}</p>
              </div>
            `,
          });
        } catch (e) {
          console.warn("[Team Invite] Failed to resend email:", e);
        }

        return { success: true };
      }),
  });
