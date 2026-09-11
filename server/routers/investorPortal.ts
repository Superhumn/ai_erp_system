// appRouter.investorPortal — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { sendEmail } from "../_core/email";
import * as db from "../db";
import { ENV } from "../_core/env";
import { adminProcedure, resolveInvestorContext, investorCompanyIdInput } from "./_shared";

// ============================================
// INVESTOR PORTAL (logged-in existing-investor view)
// ============================================
//
// Three procedures are gated to users with role='investor' (or admin/exec
// for support/testing). A fourth, `inviteToPortal`, is admin-only and
// drives the invite flow that turns a cap-table stakeholder into a user.
export const investorPortalRouter = router({
    // The logged-in investor's own cap-table position. Returns their
    // stakeholder row, every grant, and the total-shares figure used to
    // derive ownership % — but never data about other stakeholders.
    me: protectedProcedure
      .input(investorCompanyIdInput)
      .query(async ({ ctx, input }) => {
      const { stakeholder, allStakeholders } = await resolveInvestorContext(ctx, input?.companyId);
      if (!stakeholder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No cap-table record is linked to your account. Ask the admin to link your stakeholder row.",
        });
      }
      const grants = await db.getEquityGrantsByStakeholder(stakeholder.id);
      const allGrants = await db.getEquityGrants(stakeholder.companyId ?? undefined);
      const shareClasses = await db.getShareClasses(stakeholder.companyId ?? undefined);
      const entity = stakeholder.companyId
        ? await db.getCompanyById(stakeholder.companyId)
        : undefined;
      // The full list of entities this user holds a position in, so the
      // UI can render an entity switcher. Companies are bulk-loaded once
      // (deduped) to avoid a query per stakeholder.
      const companyIds = [...new Set(allStakeholders.map((s) => s.companyId).filter((id): id is number => id != null))];
      const companyById = new Map((await db.getCompaniesByIds(companyIds)).map((c) => [c.id, c]));
      const entities = allStakeholders
        .map((s) => {
          if (!s.companyId) return null;
          const c = companyById.get(s.companyId);
          return c ? { id: c.id, name: c.name, type: c.type, country: c.country } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const totalShares = allGrants.reduce(
        (s: number, g: { shares?: string | number | null }) =>
          s + parseFloat(String(g.shares ?? "0")),
        0,
      );
      const mySharesOutstanding = grants.reduce(
        (s, g: { shares?: string | number | null }) =>
          s + parseFloat(String(g.shares ?? "0")),
        0,
      );
      const ownershipPct = totalShares > 0 ? (mySharesOutstanding / totalShares) * 100 : 0;

      // Decorate each grant with its share-class name so the UI doesn't
      // have to make another call to resolve `shareClassId`.
      const classById = new Map(shareClasses.map((c: { id: number }) => [c.id, c]));
      const decoratedGrants = grants.map((g: { shareClassId: number } & Record<string, unknown>) => ({
        ...g,
        shareClass: classById.get(g.shareClassId) ?? null,
      }));

      return {
        stakeholder: {
          id: stakeholder.id,
          name: stakeholder.name,
          email: stakeholder.email,
          type: stakeholder.type,
          title: stakeholder.title,
          relationship: stakeholder.relationship,
          // Surfaced so the client can hide tier-gated sections (board
          // materials, top-holder list) without a wasted FORBIDDEN call.
          tier: stakeholder.tier,
          accreditedInvestor: stakeholder.accreditedInvestor,
        },
        entity: entity
          ? { id: entity.id, name: entity.name, type: entity.type, country: entity.country }
          : null,
        entities,
        grants: decoratedGrants,
        ownershipPct,
        sharesOutstanding: mySharesOutstanding,
        totalSharesOutstanding: totalShares,
      };
    }),

    // Wider financials snapshot than the prospect-facing /dr/:code page.
    financials: protectedProcedure
      .input(investorCompanyIdInput)
      .query(async ({ ctx, input }) => {
        const { companyId } = await resolveInvestorContext(ctx, input?.companyId);
        const { computeInvestorPortalFinancials } = await import("../investorPortalFinancials");
        return computeInvestorPortalFinancials({ companyId });
      }),

    // Investor updates the admin has published. We only show `status='sent'`
    // so drafts and in-review pieces don't leak.
    updates: protectedProcedure
      .input(investorCompanyIdInput)
      .query(async ({ ctx, input }) => {
      const { companyId } = await resolveInvestorContext(ctx, input?.companyId);
      const updates = await db.getInvestorUpdates({
        status: "sent",
        companyId,
      });
      return updates.map((u: Record<string, unknown>) => ({
        id: u.id,
        title: u.title,
        period: u.period,
        type: u.type,
        content: u.content,
        highlights: u.highlights,
        sentAt: u.sentAt,
      }));
    }),

    // Admin-only: provision an investor user by inviting a stakeholder to
    // the portal. Creates a `team_invites` row with role=investor and a
    // link back to the stakeholder; when the invite is accepted,
    // localAuth attaches the new user to that cap-table row.
    inviteToPortal: adminProcedure
      .input(z.object({ stakeholderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const stakeholder = await db.getStakeholderById(input.stakeholderId);
        if (!stakeholder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Stakeholder not found" });
        }
        if (!stakeholder.email) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Stakeholder has no email on file — add one before inviting.",
          });
        }
        if (stakeholder.userId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Stakeholder is already linked to a user account.",
          });
        }

        const crypto = await import("crypto");
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        await db.createTeamInvite({
          email: stakeholder.email.toLowerCase(),
          name: stakeholder.name,
          role: "investor",
          invitedBy: ctx.user.id,
          token,
          expiresAt,
          linkedStakeholderId: stakeholder.id,
        });

        const inviteUrl = `${ENV.publicAppUrl}/login?invite=${token}`;
        // Names come from admin-editable fields, so they can contain '<' / '&'
        // that would either break the email HTML or smuggle markup into the
        // investor's inbox. Escape before interpolation.
        const escapeHtml = (s: string) => s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
        const safeStakeholder = escapeHtml(stakeholder.name || "");
        const safeInviter = escapeHtml(ctx.user.name || "The team");

        let emailResult: { success: boolean; error?: unknown };
        try {
          emailResult = await sendEmail({
            to: stakeholder.email,
            subject: "You have access to your investor portal",
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Welcome to your investor portal</h2>
                <p>Hi ${safeStakeholder},</p>
                <p>${safeInviter} has invited you to log in to your investor portal, where you can review your equity position and the company's current financials whenever you'd like.</p>
                <a href="${inviteUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 16px 0;">
                  Activate your portal
                </a>
                <p style="color: #888; font-size: 12px;">This invitation expires in 14 days. If the button doesn't work, copy this link: ${inviteUrl}</p>
              </div>
            `,
          });
        } catch (e) {
          console.warn("[Investor Portal] sendEmail threw:", e);
          emailResult = { success: false, error: e };
        }

        // `sendEmail` returns `{ success: false, error }` when SendGrid or its
        // env is missing — it does NOT throw. Surface that to the admin so
        // they know to reconfigure or resend. The invite row still exists
        // and remains valid, so the admin can hit "Invite" again after
        // fixing the email setup.
        if (!emailResult.success) {
          console.warn("[Investor Portal] invite created but email not sent:", emailResult.error);
        }
        return { success: true, emailSent: emailResult.success };
      }),

    // ─── Active rounds + pro-rata signaling ─────────────────────────
    //
    // Surfaces fundraisingCampaigns with status='active' so existing
    // investors can see when a round is open and signal pro-rata
    // interest. The signal is non-binding — IR follows up offline to
    // collect subscription docs. We deliberately don't expose the
    // campaign's existing investor list (other check sizes / commits)
    // here; that's an IR/founder view, not an investor view.
    activeRounds: protectedProcedure
      .input(investorCompanyIdInput)
      .query(async ({ ctx, input }) => {
      const { stakeholder, companyId } = await resolveInvestorContext(ctx, input?.companyId);
      const all = await db.getFundraisingCampaigns(companyId);
      type Campaign = {
        id: number; name: string; description: string | null;
        targetAmount: string | null; raisedAmount: string | null;
        minimumInvestment: string | null; valuation: string | null;
        roundType: string; equityOffered: string | null;
        startDate: Date | null; targetCloseDate: Date | null;
        status: string;
      };
      const open = (all as Campaign[]).filter((c) => c.status === "active");

      // Decorate each open round with the caller's existing pro-rata
      // signal (if any) so the UI can show "you indicated $X" instead
      // of a generic CTA. Admins viewing for support get null here.
      const decorated = await Promise.all(
        open.map(async (c) => {
          const myIndication = stakeholder
            ? await db.getProRataIndication(c.id, stakeholder.id)
            : undefined;
          return {
            id: c.id,
            name: c.name,
            description: c.description,
            roundType: c.roundType,
            targetAmount: c.targetAmount,
            raisedAmount: c.raisedAmount,
            minimumInvestment: c.minimumInvestment,
            valuation: c.valuation,
            equityOffered: c.equityOffered,
            targetCloseDate: c.targetCloseDate,
            myIndication: myIndication
              ? {
                  indicatedAmount: myIndication.indicatedAmount,
                  notes: myIndication.notes,
                  status: myIndication.status,
                  createdAt: myIndication.createdAt,
                }
              : null,
          };
        }),
      );
      return decorated;
    }),

    indicateInterest: protectedProcedure
      .input(z.object({
        campaignId: z.number(),
        companyId: z.number().optional(),
        // Decimal-as-string: stays out of float-rounding territory and
        // matches how Drizzle's decimal column accepts values.
        indicatedAmount: z.string()
          .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 50000 or 50000.00")
          .optional(),
        notes: z.string().max(2000).optional(),
        // Investors can withdraw a prior indication; the IR team still
        // sees the row historically so they know it was withdrawn.
        withdraw: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "investor") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only investors can signal pro-rata interest." });
        }
        const { stakeholder, companyId } = await resolveInvestorContext(ctx, input.companyId);
        if (!stakeholder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "No cap-table record is linked to your account." });
        }
        // Verify the campaign is real, active, and in the same company.
        const all = await db.getFundraisingCampaigns(companyId);
        const campaign = (all as Array<{ id: number; status: string }>).find((c) => c.id === input.campaignId);
        if (!campaign) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });
        }
        if (campaign.status !== "active") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This round is no longer open." });
        }
        await db.upsertProRataIndication({
          campaignId: input.campaignId,
          stakeholderId: stakeholder.id,
          indicatedAmount: input.indicatedAmount,
          notes: input.notes,
          status: input.withdraw ? "withdrawn" : "interested",
        });
        return { success: true };
      }),

    // ─── Board materials (board-tier only) ──────────────────────────
    //
    // Surfaces approved/signed board resolutions to investors with a
    // board seat. Only `tier='board'` (or admin/exec for support) sees
    // them — major investors without a seat get a clear FORBIDDEN, not
    // an empty list, so they know the section exists but isn't theirs.
    //
    // Drafts and in-review resolutions are excluded so we don't leak
    // pre-decisional material.
    boardMaterials: protectedProcedure
      .input(investorCompanyIdInput)
      .query(async ({ ctx, input }) => {
      const { stakeholder, companyId } = await resolveInvestorContext(ctx, input?.companyId);
      // Tier gate: investor must hold tier='board'. Admin/exec bypass.
      const allowed = ctx.user.role === "admin"
        || ctx.user.role === "exec"
        || stakeholder?.tier === "board";
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Board materials are only available to investors with a board seat.",
        });
      }

      const resolutions = await db.getBoardResolutions({ companyId });
      // Whitelist statuses we're willing to show. `approved`/`signed`/
      // `archived` are board-history; everything else is pre-decisional.
      const visible = (resolutions as Array<{
        id: number; title: string; type: string; description: string | null;
        documentUrl: string | null; status: string | null;
        approvedAt: Date | null; submittedAt: Date | null;
      }>).filter((r) =>
        r.status === "approved" || r.status === "signed" || r.status === "archived",
      );
      return visible.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        description: r.description,
        documentUrl: r.documentUrl,
        status: r.status,
        approvedAt: r.approvedAt,
      }));
    }),

    // ─── Cap table summary (tier-aware) ─────────────────────────────
    //
    // Every authenticated investor sees aggregate share-class totals and
    // the option-pool size. Major / board tiers additionally see a top-
    // holders list (name + ownership %, never check size). Ordinary
    // tier deliberately doesn't get other-investor names — that's the
    // line-item leak we want to avoid.
    capTableSummary: protectedProcedure
      .input(investorCompanyIdInput)
      .query(async ({ ctx, input }) => {
      const { stakeholder, companyId } = await resolveInvestorContext(ctx, input?.companyId);
      const [grants, classes, allStakeholders] = await Promise.all([
        db.getEquityGrants(companyId),
        db.getShareClasses(companyId),
        db.getStakeholders(companyId),
      ]);

      // Aggregate by share class. We only count grants that aren't fully
      // cancelled / expired; partially-vested counts since the underlying
      // shares still exist.
      type Grant = { stakeholderId: number; shareClassId: number; shares: string | number | null; status?: string | null };
      type ShareClass = { id: number; name: string; type: string; authorizedShares?: string | number | null };
      type Stk = { id: number; name: string };

      const live = (grants as Grant[]).filter(
        (g) => g.status !== "cancelled" && g.status !== "expired",
      );
      const totalOutstanding = live.reduce(
        (s, g) => s + parseFloat(String(g.shares ?? "0")),
        0,
      );

      const classBreakdown = (classes as ShareClass[]).map((c) => {
        const classGrants = live.filter((g) => g.shareClassId === c.id);
        const sharesIssued = classGrants.reduce(
          (s, g) => s + parseFloat(String(g.shares ?? "0")),
          0,
        );
        const authorized = c.authorizedShares
          ? parseFloat(String(c.authorizedShares))
          : null;
        return {
          id: c.id,
          name: c.name,
          type: c.type,
          sharesIssued,
          authorized,
          ownershipPct: totalOutstanding > 0 ? (sharesIssued / totalOutstanding) * 100 : 0,
        };
      });

      // Option pool: the total of share classes with type="option_pool"
      // (already in classBreakdown), so callers don't need to compute it.
      const optionPool = classBreakdown.find((c) => c.type === "option_pool") ?? null;

      // Top-holder list — only exposed to major / board tiers (or when
      // the caller is an admin/exec doing support work). Aggregates each
      // stakeholder's grants across all their share classes.
      const tier = stakeholder?.tier ?? "ordinary";
      const showTopHolders = tier === "major" || tier === "board"
        || ctx.user.role === "admin" || ctx.user.role === "exec";

      let topHolders: Array<{ name: string; sharesOutstanding: number; ownershipPct: number }> | null = null;
      if (showTopHolders) {
        const stakeholderById = new Map((allStakeholders as Stk[]).map((s) => [s.id, s]));
        const bySh = new Map<number, number>();
        for (const g of live) {
          bySh.set(
            g.stakeholderId,
            (bySh.get(g.stakeholderId) ?? 0) + parseFloat(String(g.shares ?? "0")),
          );
        }
        topHolders = Array.from(bySh.entries())
          .map(([sid, shares]) => ({
            name: stakeholderById.get(sid)?.name ?? "Unknown",
            sharesOutstanding: shares,
            ownershipPct: totalOutstanding > 0 ? (shares / totalOutstanding) * 100 : 0,
          }))
          .sort((a, b) => b.sharesOutstanding - a.sharesOutstanding)
          .slice(0, 10);
      }

      return {
        tier,
        totalSharesOutstanding: totalOutstanding,
        classBreakdown,
        optionPool,
        topHolders,
      };
    }),

    // ─── My Documents (per-stakeholder document locker) ─────────────
    //
    // The investor sees only documents attached to their own stakeholder
    // record. Admins can browse any stakeholder's locker via the
    // `capTable.stakeholders.documents.*` admin endpoints.
    documents: router({
      list: protectedProcedure
        .input(investorCompanyIdInput)
        .query(async ({ ctx, input }) => {
        const { stakeholder } = await resolveInvestorContext(ctx, input?.companyId);
        if (!stakeholder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "No cap-table record is linked to your account." });
        }
        const docs = await db.getStakeholderDocuments(stakeholder.id);
        // Strip storageKey from the wire response — it's an internal
        // bucket path the client has no business holding. Downloads go
        // through `downloadUrl` which re-resolves it server-side.
        return docs.map((d) => ({
          id: d.id,
          title: d.title,
          description: d.description,
          category: d.category,
          fileType: d.fileType,
          mimeType: d.mimeType,
          fileSize: d.fileSize,
          createdAt: d.createdAt,
        }));
      }),
      // Returns a short-lived signed URL the browser can hit directly.
      // We re-validate ownership on every call so a leaked id from one
      // investor can't be replayed by another.
      downloadUrl: protectedProcedure
        .input(z.object({ id: z.number(), companyId: z.number().optional() }))
        .mutation(async ({ input, ctx }) => {
          const { stakeholder, allStakeholders } = await resolveInvestorContext(ctx, input.companyId);
          if (!stakeholder) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No cap-table record is linked to your account." });
          }
          const doc = await db.getStakeholderDocumentById(input.id);
          // Allow download if the doc belongs to ANY stakeholder row this
          // user owns — so switching entities in the UI doesn't break
          // download links the user just rendered.
          const ownedIds = new Set(allStakeholders.map((s) => s.id));
          if (!doc || !ownedIds.has(doc.stakeholderId)) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
          }
          const { storageGet } = await import("../storage");
          const { url } = await storageGet(doc.storageKey);
          return { url, mimeType: doc.mimeType, title: doc.title };
        }),
    }),

    // ─── Profile & Preferences (self-service) ───────────────────────
    //
    // The investor edits their own contact + payment + accreditation
    // info. Email is editable but `userId` and `type` aren't — those
    // are admin-controlled.
    profile: router({
      get: protectedProcedure
        .input(investorCompanyIdInput)
        .query(async ({ ctx, input }) => {
        const { stakeholder } = await resolveInvestorContext(ctx, input?.companyId);
        if (!stakeholder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "No cap-table record is linked to your account." });
        }
        return {
          name: stakeholder.name,
          email: stakeholder.email,
          address: stakeholder.address,
          mailingAddress: stakeholder.mailingAddress,
          paymentPreference: stakeholder.paymentPreference,
          accreditedInvestor: stakeholder.accreditedInvestor,
          accreditedReAttestedAt: stakeholder.accreditedReAttestedAt,
        };
      }),
      update: protectedProcedure
        .input(z.object({
          companyId: z.number().optional(),
          name: z.string().min(1).max(256).optional(),
          email: z.string().email().optional(),
          address: z.string().max(2000).optional(),
          mailingAddress: z.string().max(2000).optional(),
          paymentPreference: z.string().max(2000).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { companyId, ...patch } = input;
          const { stakeholder } = await resolveInvestorContext(ctx, companyId);
          if (!stakeholder) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No cap-table record is linked to your account." });
          }
          await db.updateStakeholder(stakeholder.id, patch);
          return { success: true };
        }),
      // Re-attestation creates a timestamped self-certification that the
      // investor still qualifies as accredited under the SEC's Reg D
      // criteria. We don't re-validate the criteria here — that's a
      // legal review the investor does themselves.
      reAttestAccreditation: protectedProcedure
        .input(z.object({ accredited: z.boolean(), companyId: z.number().optional() }))
        .mutation(async ({ input, ctx }) => {
          const { stakeholder } = await resolveInvestorContext(ctx, input.companyId);
          if (!stakeholder) {
            throw new TRPCError({ code: "NOT_FOUND", message: "No cap-table record is linked to your account." });
          }
          await db.updateStakeholder(stakeholder.id, {
            accreditedInvestor: input.accredited,
            accreditedReAttestedAt: new Date(),
          });
          return { success: true };
        }),
    }),
  });
