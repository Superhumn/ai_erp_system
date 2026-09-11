// appRouter.capTable — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { storagePut } from "../storage";
import { adminProcedure, createAuditLog } from "./_shared";

// ============================================
// CAP TABLE & EQUITY MANAGEMENT
// ============================================
export const capTableRouter = router({
    shareClasses: router({
      list: protectedProcedure
        .input(z.object({ companyId: z.number().optional() }).optional())
        .query(({ input }) => db.getShareClasses(input?.companyId)),
      create: protectedProcedure
        .input(z.object({
          companyId: z.number().optional(),
          name: z.string().min(1),
          type: z.enum(["common", "preferred", "convertible_note", "safe", "warrant", "option_pool"]),
          authorizedShares: z.string().optional(),
          parValue: z.string().optional(),
          pricePerShare: z.string().optional(),
          liquidationPreference: z.string().optional(),
          liquidationMultiple: z.string().optional(),
          isParticipating: z.boolean().optional(),
          participationCap: z.string().optional(),
          conversionRatio: z.string().optional(),
          votingRights: z.boolean().optional(),
          dividendRate: z.string().optional(),
          antidilutionProtection: z.enum(["none", "broad_weighted_average", "narrow_weighted_average", "full_ratchet"]).optional(),
          boardSeats: z.number().optional(),
          seniorityRank: z.number().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createShareClass(input);
          await createAuditLog(ctx.user.id, 'create', 'share_class', result.id, input.name);
          return result;
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          type: z.enum(["common", "preferred", "convertible_note", "safe", "warrant", "option_pool"]).optional(),
          authorizedShares: z.string().optional(),
          parValue: z.string().optional(),
          pricePerShare: z.string().optional(),
          liquidationPreference: z.string().optional(),
          liquidationMultiple: z.string().optional(),
          isParticipating: z.boolean().optional(),
          participationCap: z.string().optional(),
          conversionRatio: z.string().optional(),
          votingRights: z.boolean().optional(),
          dividendRate: z.string().optional(),
          antidilutionProtection: z.enum(["none", "broad_weighted_average", "narrow_weighted_average", "full_ratchet"]).optional(),
          boardSeats: z.number().optional(),
          seniorityRank: z.number().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateShareClass(id, data);
          await createAuditLog(ctx.user.id, 'update', 'share_class', id);
          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteShareClass(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'share_class', input.id);
          return { success: true };
        }),
    }),

    stakeholders: router({
      list: protectedProcedure
        .input(z.object({ companyId: z.number().optional() }).optional())
        .query(({ input }) => db.getStakeholders(input?.companyId)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getStakeholderById(input.id)),
      create: protectedProcedure
        .input(z.object({
          companyId: z.number().optional(),
          name: z.string().min(1),
          email: z.string().optional(),
          type: z.enum(["founder", "employee", "investor", "advisor", "board_member", "contractor"]),
          title: z.string().optional(),
          relationship: z.string().optional(),
          address: z.string().optional(),
          taxId: z.string().optional(),
          accreditedInvestor: z.boolean().optional(),
          notes: z.string().optional(),
          userId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createStakeholder(input);
          await createAuditLog(ctx.user.id, 'create', 'stakeholder', result.id, input.name);
          return result;
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          email: z.string().optional(),
          type: z.enum(["founder", "employee", "investor", "advisor", "board_member", "contractor"]).optional(),
          title: z.string().optional(),
          relationship: z.string().optional(),
          // Investor-portal entitlement tier — admin-only setting that drives
          // which gated portal sections become visible.
          tier: z.enum(["ordinary", "major", "board"]).optional(),
          address: z.string().optional(),
          mailingAddress: z.string().optional(),
          paymentPreference: z.string().optional(),
          taxId: z.string().optional(),
          accreditedInvestor: z.boolean().optional(),
          notes: z.string().optional(),
          userId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateStakeholder(id, data);
          await createAuditLog(ctx.user.id, 'update', 'stakeholder', id);
          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const database = await db.getDb();
          if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
          const { stakeholders: sh } = await import("../../drizzle/schema");
          await database.delete(sh).where(eq(sh.id, input.id));
          await createAuditLog(ctx.user.id, 'delete', 'stakeholder', input.id);
          return { success: true };
        }),
      deletePlaceholders: protectedProcedure
        .mutation(async ({ ctx }) => {
          const database = await db.getDb();
          if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
          const { stakeholders: sh } = await import("../../drizzle/schema");
          // Delete stakeholders with placeholder-like names (Investor 1, Investor 2, etc.)
          const all = await database.select().from(sh);
          const placeholders = all.filter((s: any) => /^(Investor|Stakeholder|Placeholder)\s*\d+$/i.test(s.name || ""));
          for (const p of placeholders) {
            await database.delete(sh).where(eq(sh.id, p.id));
          }
          await createAuditLog(ctx.user.id, 'delete', 'stakeholder', 0, `Deleted ${placeholders.length} placeholder stakeholders`);
          return { deleted: placeholders.length };
        }),

      // Admin-side per-stakeholder document locker. Mirrors the
      // investor-facing `investorPortal.documents.*` endpoints but lets
      // an admin manage docs for any stakeholder. Files come up the wire
      // as base64 — fine for typical investor docs (PDFs <10MB), and
      // saves a presigned-URL round trip. We cap upload size at 25MB.
      documents: router({
        list: adminProcedure
          .input(z.object({ stakeholderId: z.number() }))
          .query(({ input }) => db.getStakeholderDocuments(input.stakeholderId)),
        upload: adminProcedure
          .input(z.object({
            stakeholderId: z.number(),
            title: z.string().min(1).max(256),
            description: z.string().max(2000).optional(),
            category: z.enum(["agreement", "side_letter", "k1", "capital_call", "distribution", "other"]).default("other"),
            fileName: z.string().min(1).max(256),
            mimeType: z.string().max(128),
            // base64-encoded file body. 25MB raw → ~33MB base64; reject anything bigger.
            base64: z.string().max(35_000_000),
          }))
          .mutation(async ({ input, ctx }) => {
            const stakeholder = await db.getStakeholderById(input.stakeholderId);
            if (!stakeholder) {
              throw new TRPCError({ code: "NOT_FOUND", message: "Stakeholder not found" });
            }
            const buffer = Buffer.from(input.base64, "base64");
            if (buffer.length > 25 * 1024 * 1024) {
              throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "File exceeds 25MB upload limit" });
            }
            // Slug the filename so storage keys stay tame; timestamp prefix
            // prevents collisions across re-uploads of the same name.
            const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
            const key = `investor-docs/${stakeholder.id}/${Date.now()}-${safeName}`;
            const { storagePut } = await import("../storage");
            const { url } = await storagePut(key, buffer, input.mimeType);
            const ext = input.fileName.split(".").pop()?.toLowerCase() ?? null;
            const result = await db.createStakeholderDocument({
              companyId: stakeholder.companyId ?? undefined,
              stakeholderId: stakeholder.id,
              title: input.title,
              description: input.description,
              category: input.category,
              fileType: ext,
              mimeType: input.mimeType,
              fileSize: buffer.length,
              storageKey: key,
              storageUrl: url,
              uploadedBy: ctx.user.id,
            });
            await createAuditLog(ctx.user.id, "create", "stakeholder_document", result.id, input.title);
            return { id: result.id };
          }),
        delete: adminProcedure
          .input(z.object({ id: z.number() }))
          .mutation(async ({ input, ctx }) => {
            await db.deleteStakeholderDocument(input.id);
            await createAuditLog(ctx.user.id, "delete", "stakeholder_document", input.id);
            return { success: true };
          }),
      }),
    }),

    grants: router({
      list: protectedProcedure
        .input(z.object({ companyId: z.number().optional(), stakeholderId: z.number().optional() }).optional())
        .query(({ input }) => {
          if (input?.stakeholderId) return db.getEquityGrantsByStakeholder(input.stakeholderId);
          return db.getEquityGrants(input?.companyId);
        }),
      create: protectedProcedure
        .input(z.object({
          companyId: z.number().optional(),
          stakeholderId: z.number(),
          shareClassId: z.number(),
          grantType: z.enum(["purchase", "option_iso", "option_nso", "rsu", "restricted_stock", "convertible_note", "safe", "warrant", "secondary"]),
          grantDate: z.string().or(z.date()),
          shares: z.string(),
          pricePerShare: z.string(),
          totalValue: z.string().optional(),
          status: z.enum(["active", "partially_vested", "fully_vested", "exercised", "cancelled", "expired", "converted"]).optional(),
          vestingStartDate: z.string().or(z.date()).optional(),
          vestingEndDate: z.string().or(z.date()).optional(),
          vestingSchedule: z.enum(["none", "monthly", "quarterly", "annually", "custom"]).optional(),
          cliffMonths: z.number().optional(),
          totalVestingMonths: z.number().optional(),
          accelerationOnChange: z.boolean().optional(),
          doubleAcceleration: z.boolean().optional(),
          sharesVested: z.string().optional(),
          sharesExercised: z.string().optional(),
          exercisePrice: z.string().optional(),
          expirationDate: z.string().or(z.date()).optional(),
          earlyExercise: z.boolean().optional(),
          principalAmount: z.string().optional(),
          interestRate: z.string().optional(),
          valuationCap: z.string().optional(),
          discountRate: z.string().optional(),
          maturityDate: z.string().or(z.date()).optional(),
          convertedToShareClassId: z.number().optional(),
          conversionDate: z.string().or(z.date()).optional(),
          certificateNumber: z.string().optional(),
          boardApprovalDate: z.string().or(z.date()).optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const grantData = {
            ...input,
            grantDate: new Date(input.grantDate),
            vestingStartDate: input.vestingStartDate ? new Date(input.vestingStartDate) : undefined,
            vestingEndDate: input.vestingEndDate ? new Date(input.vestingEndDate) : undefined,
            expirationDate: input.expirationDate ? new Date(input.expirationDate) : undefined,
            maturityDate: input.maturityDate ? new Date(input.maturityDate) : undefined,
            conversionDate: input.conversionDate ? new Date(input.conversionDate) : undefined,
            boardApprovalDate: input.boardApprovalDate ? new Date(input.boardApprovalDate) : undefined,
          };
          const result = await db.createEquityGrant(grantData as any);
          await createAuditLog(ctx.user.id, 'create', 'equity_grant', result.id);

          // Also create a "grant" transaction record
          await db.createEquityTransaction({
            companyId: input.companyId,
            grantId: result.id,
            stakeholderId: input.stakeholderId,
            type: 'grant',
            shares: input.shares,
            pricePerShare: input.pricePerShare,
            totalValue: input.totalValue,
            transactionDate: new Date(input.grantDate),
          });

          return result;
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(["active", "partially_vested", "fully_vested", "exercised", "cancelled", "expired", "converted"]).optional(),
          sharesVested: z.string().optional(),
          sharesExercised: z.string().optional(),
          vestingStartDate: z.string().or(z.date()).optional(),
          vestingEndDate: z.string().or(z.date()).optional(),
          vestingSchedule: z.enum(["none", "monthly", "quarterly", "annually", "custom"]).optional(),
          cliffMonths: z.number().optional(),
          totalVestingMonths: z.number().optional(),
          accelerationOnChange: z.boolean().optional(),
          doubleAcceleration: z.boolean().optional(),
          exercisePrice: z.string().optional(),
          expirationDate: z.string().or(z.date()).optional(),
          earlyExercise: z.boolean().optional(),
          convertedToShareClassId: z.number().optional(),
          conversionDate: z.string().or(z.date()).optional(),
          certificateNumber: z.string().optional(),
          boardApprovalDate: z.string().or(z.date()).optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          const updateData = {
            ...data,
            vestingStartDate: data.vestingStartDate ? new Date(data.vestingStartDate) : undefined,
            vestingEndDate: data.vestingEndDate ? new Date(data.vestingEndDate) : undefined,
            expirationDate: data.expirationDate ? new Date(data.expirationDate) : undefined,
            conversionDate: data.conversionDate ? new Date(data.conversionDate) : undefined,
            boardApprovalDate: data.boardApprovalDate ? new Date(data.boardApprovalDate) : undefined,
          };
          await db.updateEquityGrant(id, updateData as any);
          await createAuditLog(ctx.user.id, 'update', 'equity_grant', id);
          return { success: true };
        }),
    }),

    valuations: router({
      list: protectedProcedure
        .input(z.object({ companyId: z.number().optional() }).optional())
        .query(({ input }) => db.getValuations409a(input?.companyId)),
      create: protectedProcedure
        .input(z.object({
          companyId: z.number().optional(),
          valuationDate: z.string().or(z.date()),
          fairMarketValue: z.string(),
          totalValuation: z.string().optional(),
          provider: z.string().optional(),
          methodology: z.string().optional(),
          status: z.enum(["draft", "pending", "approved", "expired"]).optional(),
          expirationDate: z.string().or(z.date()).optional(),
          reportUrl: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const valData = {
            ...input,
            valuationDate: new Date(input.valuationDate),
            expirationDate: input.expirationDate ? new Date(input.expirationDate) : undefined,
          };
          const result = await db.createValuation409a(valData as any);
          await createAuditLog(ctx.user.id, 'create', 'valuation_409a', result.id);
          return result;
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          fairMarketValue: z.string().optional(),
          totalValuation: z.string().optional(),
          provider: z.string().optional(),
          methodology: z.string().optional(),
          status: z.enum(["draft", "pending", "approved", "expired"]).optional(),
          expirationDate: z.string().or(z.date()).optional(),
          reportUrl: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          const updateData = {
            ...data,
            expirationDate: data.expirationDate ? new Date(data.expirationDate) : undefined,
          };
          await db.updateValuation409a(id, updateData as any);
          await createAuditLog(ctx.user.id, 'update', 'valuation_409a', id);
          return { success: true };
        }),
    }),

    transactions: router({
      list: protectedProcedure
        .input(z.object({
          companyId: z.number().optional(),
          grantId: z.number().optional(),
          stakeholderId: z.number().optional(),
        }).optional())
        .query(({ input }) => db.getEquityTransactions(input)),
      create: protectedProcedure
        .input(z.object({
          companyId: z.number().optional(),
          grantId: z.number(),
          stakeholderId: z.number(),
          type: z.enum(["grant", "vest", "exercise", "cancel", "expire", "convert", "transfer", "repurchase", "forfeit"]),
          shares: z.string(),
          pricePerShare: z.string().optional(),
          totalValue: z.string().optional(),
          transactionDate: z.string().or(z.date()),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const txData = {
            ...input,
            transactionDate: new Date(input.transactionDate),
          };
          const result = await db.createEquityTransaction(txData as any);
          await createAuditLog(ctx.user.id, 'create', 'equity_transaction', result.id);
          return result;
        }),
    }),

    summary: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getCapTableSummary(input?.companyId)),

    generateReport: protectedProcedure
      .input(z.object({
        reportType: z.string(),
        stakeholderId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        exitValuation: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const shareClasses = await db.getShareClasses();
        const allStakeholders = await db.getStakeholders();
        const grants = await db.getEquityGrants();
        const transactions = await db.getEquityTransactions();
        const valuations = await db.getValuations409a();

        // Exclude terminated/cancelled grants from share counts
        const activeGrants = grants.filter(g => g.status !== "cancelled" && g.status !== "expired");
        const totalSharesNum = activeGrants.reduce((acc, g) => acc + parseFloat(g.shares || "0"), 0);
        const generatedAt = new Date().toISOString();
        let headers: string[] = [];
        let rows: any[][] = [];
        let title = "";

        const fmtNum = (v: number) => v.toLocaleString("en-US");
        const fmtPct = (v: number) => (v < 0.01 && v > 0 ? "<0.01%" : v.toFixed(2) + "%");
        const fmtDate = (v: Date | string | null | undefined) => {
          if (!v) return "-";
          try { return new Date(v).toISOString().split("T")[0]; } catch { return "-"; }
        };

        // Helper: build stakeholder name map
        const stakeholderMap = new Map(allStakeholders.map(s => [s.id, s]));
        const shareClassMap = new Map(shareClasses.map(sc => [sc.id, sc]));

        switch (input.reportType) {
          case "detailed_cap_table":
          case "raw_captable": {
            title = input.reportType === "detailed_cap_table" ? "Detailed Cap Table" : "Raw Cap Table";
            if (input.reportType === "raw_captable") {
              headers = ["Share Class", "Type", "Seniority", "Authorized", "Issued", "Outstanding (Vested)", "Available", "% of Total", "Par Value", "Price/Share", "Liq. Pref.", "Voting"];
              rows = shareClasses.map(sc => {
                const classGrants = activeGrants.filter(g => g.shareClassId === sc.id);
                const issued = classGrants.reduce((a, g) => a + parseFloat(g.shares || "0"), 0);
                const vested = classGrants.reduce((a, g) => a + parseFloat(g.sharesVested || "0"), 0);
                const authorized = parseFloat(sc.authorizedShares || "0");
                const available = Math.max(0, authorized - issued);
                const pct = totalSharesNum > 0 ? (issued / totalSharesNum) * 100 : 0;
                return [
                  sc.name, sc.type, sc.seniorityRank ?? "-", fmtNum(authorized), fmtNum(issued), fmtNum(vested),
                  fmtNum(available), fmtPct(pct), sc.parValue || "-", sc.pricePerShare || "-",
                  sc.liquidationPreference || "-", sc.votingRights ? "Yes" : "No",
                ];
              });
            } else {
              // Detailed cap table: share class summary + per-stakeholder breakdown
              headers = ["Stakeholder / Class", "Type", "Grant Type", "Shares", "Vested", "Unvested", "Exercise Price", "Status", "% Ownership"];

              for (const sc of shareClasses) {
                const classGrants = activeGrants.filter(g => g.shareClassId === sc.id);
                const classIssued = classGrants.reduce((a, g) => a + parseFloat(g.shares || "0"), 0);
                const classVested = classGrants.reduce((a, g) => a + parseFloat(g.sharesVested || "0"), 0);
                const authorized = parseFloat(sc.authorizedShares || "0");
                const classPct = totalSharesNum > 0 ? (classIssued / totalSharesNum) * 100 : 0;
                // Section header for share class
                rows.push([`── ${sc.name} ──`, sc.type, "", fmtNum(authorized) + " auth", fmtNum(classIssued) + " issued", fmtNum(classVested) + " vested", sc.pricePerShare || "-", "", fmtPct(classPct)]);

                // Per-stakeholder rows within this class
                for (const g of classGrants) {
                  const sh = stakeholderMap.get(g.stakeholderId!);
                  const shares = parseFloat(g.shares || "0");
                  const vested = parseFloat(g.sharesVested || "0");
                  const unvested = Math.max(0, shares - vested);
                  const pct = totalSharesNum > 0 ? (shares / totalSharesNum) * 100 : 0;
                  rows.push([
                    sh?.name || `#${g.stakeholderId}`,
                    sh?.type || "-",
                    g.grantType || "-",
                    fmtNum(shares),
                    fmtNum(vested),
                    fmtNum(unvested),
                    g.exercisePrice || g.pricePerShare || "-",
                    g.status || "-",
                    fmtPct(pct),
                  ]);
                }
              }
            }
            // Add totals row
            const totalAuthorized = shareClasses.reduce((a, sc) => a + parseFloat(sc.authorizedShares || "0"), 0);
            const totalIssued = totalSharesNum;
            const totalVested = activeGrants.reduce((a, g) => a + parseFloat(g.sharesVested || "0"), 0);
            if (input.reportType === "raw_captable") {
              rows.push(["TOTAL", "", "", fmtNum(totalAuthorized), fmtNum(totalIssued), fmtNum(totalVested), fmtNum(Math.max(0, totalAuthorized - totalIssued)), "100.00%", "", "", "", ""]);
            } else {
              rows.push(["TOTAL", "", "", fmtNum(totalIssued), fmtNum(totalVested), fmtNum(totalIssued - totalVested), "", "", "100.00%"]);
            }
            break;
          }

          case "stakeholders": {
            title = "Stakeholders";
            headers = ["Name", "Email", "Type", "Title", "Relationship", "Accredited", "Total Shares", "% Ownership"];
            rows = allStakeholders.map(s => {
              const sGrants = activeGrants.filter(g => g.stakeholderId === s.id);
              const totalShares = sGrants.reduce((a, g) => a + parseFloat(g.shares || "0"), 0);
              const pct = totalSharesNum > 0 ? (totalShares / totalSharesNum) * 100 : 0;
              return [s.name, s.email || "-", s.type, s.title || "-", s.relationship || "-", s.accreditedInvestor ? "Yes" : "No", fmtNum(totalShares), fmtPct(pct)];
            });
            break;
          }

          case "stakeholder_transactions": {
            title = "Stakeholder Transaction Report";
            const filteredTx = input.stakeholderId
              ? transactions.filter(t => t.stakeholderId === input.stakeholderId)
              : transactions;
            headers = ["Date", "Stakeholder", "Type", "Shares", "Price/Share", "Total Value", "Grant ID", "Notes"];
            rows = filteredTx.map(t => {
              const sh = stakeholderMap.get(t.stakeholderId!);
              return [
                fmtDate(t.transactionDate), sh?.name || "-", t.type, t.shares || "0",
                t.pricePerShare || "-", t.totalValue || "-", t.grantId?.toString() || "-", t.notes || "-",
              ];
            });
            break;
          }

          case "termination_modelling": {
            title = "Termination Modelling";
            headers = ["Stakeholder", "Type", "Total Shares", "Vested", "Unvested", "Unvested Value", "Exercise Price", "Exercised", "Status"];
            rows = grants.map(g => {
              const sh = stakeholderMap.get(g.stakeholderId!);
              const total = parseFloat(g.shares || "0");
              const vested = parseFloat(g.sharesVested || "0");
              const unvested = Math.max(0, total - vested);
              const exercisePrice = parseFloat(g.exercisePrice || g.pricePerShare || "0");
              const unvestedValue = unvested * exercisePrice;
              return [
                sh?.name || "-", g.grantType, fmtNum(total), fmtNum(vested), fmtNum(unvested),
                unvestedValue.toLocaleString("en-US", { style: "currency", currency: "USD" }),
                exercisePrice.toFixed(4), g.sharesExercised || "0", g.status || "-",
              ];
            });
            break;
          }

          case "exercised_options": {
            title = "Exercised Options";
            headers = ["Stakeholder", "Grant Type", "Grant Date", "Shares Exercised", "Exercise Price", "Total Cost", "Share Class"];
            const exercisedGrants = grants.filter(g => parseFloat(g.sharesExercised || "0") > 0);
            const exerciseTx = transactions.filter(t => t.type === "exercise");
            // Combine from both sources
            const seen = new Set<number>();
            rows = exercisedGrants.map(g => {
              seen.add(g.id);
              const sh = stakeholderMap.get(g.stakeholderId!);
              const sc = shareClassMap.get(g.shareClassId!);
              const exercised = parseFloat(g.sharesExercised || "0");
              const price = parseFloat(g.exercisePrice || g.pricePerShare || "0");
              return [sh?.name || "-", g.grantType, fmtDate(g.grantDate), fmtNum(exercised), price.toFixed(4), (exercised * price).toLocaleString("en-US", { style: "currency", currency: "USD" }), sc?.name || "-"];
            });
            // Add exercise transactions not already covered
            exerciseTx.forEach(t => {
              if (t.grantId && seen.has(t.grantId)) return;
              const sh = stakeholderMap.get(t.stakeholderId!);
              rows.push([sh?.name || "-", "exercise", fmtDate(t.transactionDate), t.shares || "0", t.pricePerShare || "-", t.totalValue || "-", "-"]);
            });
            break;
          }

          case "iso_nso_details": {
            title = "ISO/NSO Details";
            headers = ["Stakeholder", "Grant Type", "Grant Date", "Shares", "Exercise Price", "Vested", "Exercised", "FMV at Grant", "Expiration", "Status"];
            const optionGrants = grants.filter(g => g.grantType === "option_iso" || g.grantType === "option_nso");
            // Find closest valuation for FMV at grant
            rows = optionGrants.map(g => {
              const sh = stakeholderMap.get(g.stakeholderId!);
              const grantDate = g.grantDate ? new Date(g.grantDate).getTime() : 0;
              let fmv = "-";
              if (valuations.length > 0) {
                const closest = valuations.reduce((prev, curr) => {
                  const prevDiff = Math.abs(new Date(prev.valuationDate).getTime() - grantDate);
                  const currDiff = Math.abs(new Date(curr.valuationDate).getTime() - grantDate);
                  return currDiff < prevDiff ? curr : prev;
                });
                fmv = closest.fairMarketValue || "-";
              }
              return [
                sh?.name || "-", g.grantType === "option_iso" ? "ISO" : "NSO", fmtDate(g.grantDate),
                g.shares || "0", g.exercisePrice || g.pricePerShare || "-",
                g.sharesVested || "0", g.sharesExercised || "0", fmv, fmtDate(g.expirationDate), g.status || "-",
              ];
            });
            break;
          }

          case "waterfall": {
            title = "Waterfall Report";
            const exitVal = parseFloat(input.exitValuation || "0");
            headers = ["Stakeholder", "Share Class", "Shares", "% Ownership", "Liquidation Pref.", "Proceeds", "% of Exit"];
            if (exitVal <= 0) {
              rows = [["No exit valuation provided. Enter an exit valuation to compute waterfall.", "", "", "", "", "", ""]];
              break;
            }

            // Step 1: Compute liquidation preferences by seniority
            const sortedClasses = [...shareClasses].sort((a, b) => (a.seniorityRank ?? 99) - (b.seniorityRank ?? 99));
            let remainingProceeds = exitVal;
            const classProceeds = new Map<number, number>();

            // Pay liquidation preferences (preferred first)
            for (const sc of sortedClasses) {
              if (sc.type === "preferred" && sc.liquidationPreference) {
                const classGrants = grants.filter(g => g.shareClassId === sc.id);
                const classShares = classGrants.reduce((a, g) => a + parseFloat(g.shares || "0"), 0);
                const multiple = parseFloat(sc.liquidationMultiple || "1");
                const prefAmount = parseFloat(sc.liquidationPreference) * classShares * multiple;
                const payout = Math.min(prefAmount, remainingProceeds);
                classProceeds.set(sc.id, payout);
                remainingProceeds -= payout;
              }
            }

            // Step 2: Distribute remaining pro-rata to all (including participating preferred)
            if (remainingProceeds > 0) {
              for (const sc of sortedClasses) {
                const classGrants = grants.filter(g => g.shareClassId === sc.id);
                const classShares = classGrants.reduce((a, g) => a + parseFloat(g.shares || "0"), 0);
                const pct = totalSharesNum > 0 ? classShares / totalSharesNum : 0;
                const proRata = remainingProceeds * pct;
                const existing = classProceeds.get(sc.id) || 0;

                if (sc.type === "preferred" && sc.isParticipating) {
                  classProceeds.set(sc.id, existing + proRata);
                } else if (sc.type !== "preferred" || !classProceeds.has(sc.id)) {
                  classProceeds.set(sc.id, existing + proRata);
                } else {
                  // Non-participating preferred: take the greater of liq pref or pro-rata
                  classProceeds.set(sc.id, Math.max(existing, proRata));
                }
              }
            }

            // Build rows per stakeholder
            const stakeholderProceeds = new Map<number, { shares: number; proceeds: number; className: string }>();
            for (const g of grants) {
              const shares = parseFloat(g.shares || "0");
              if (shares <= 0) continue;
              const sc = shareClassMap.get(g.shareClassId!);
              const classTotal = grants.filter(gr => gr.shareClassId === g.shareClassId).reduce((a, gr) => a + parseFloat(gr.shares || "0"), 0);
              const classProc = classProceeds.get(g.shareClassId!) || 0;
              const stakeholderShare = classTotal > 0 ? (shares / classTotal) * classProc : 0;

              const existing = stakeholderProceeds.get(g.stakeholderId!) || { shares: 0, proceeds: 0, className: sc?.name || "-" };
              existing.shares += shares;
              existing.proceeds += stakeholderShare;
              existing.className = sc?.name || "-";
              stakeholderProceeds.set(g.stakeholderId!, existing);
            }

            rows = Array.from(stakeholderProceeds.entries()).map(([shId, data]) => {
              const sh = stakeholderMap.get(shId);
              const pct = totalSharesNum > 0 ? (data.shares / totalSharesNum) * 100 : 0;
              const exitPct = exitVal > 0 ? (data.proceeds / exitVal) * 100 : 0;
              return [
                sh?.name || "-", data.className, fmtNum(data.shares), fmtPct(pct), "-",
                data.proceeds.toLocaleString("en-US", { style: "currency", currency: "USD" }), fmtPct(exitPct),
              ];
            });
            rows.push(["TOTAL", "", fmtNum(totalSharesNum), "100.00%", "", exitVal.toLocaleString("en-US", { style: "currency", currency: "USD" }), "100.00%"]);
            break;
          }

          case "vesting_details": {
            title = "Vesting Details";
            headers = ["Stakeholder", "Grant Date", "Schedule", "Cliff (mo)", "Total Vesting (mo)", "Total Shares", "Vested", "Unvested", "Next Vest", "Status"];
            const vestingGrants = input.stakeholderId
              ? grants.filter(g => g.stakeholderId === input.stakeholderId && g.vestingSchedule && g.vestingSchedule !== "none")
              : grants.filter(g => g.vestingSchedule && g.vestingSchedule !== "none");
            rows = vestingGrants.map(g => {
              const sh = stakeholderMap.get(g.stakeholderId!);
              const total = parseFloat(g.shares || "0");
              const vested = parseFloat(g.sharesVested || "0");
              const unvested = Math.max(0, total - vested);
              // Compute next vest date
              let nextVest = "-";
              if (g.vestingStartDate && vested < total) {
                const start = new Date(g.vestingStartDate);
                const cliffDate = new Date(start);
                cliffDate.setMonth(cliffDate.getMonth() + (g.cliffMonths || 0));
                const now = new Date();
                if (now < cliffDate) {
                  nextVest = fmtDate(cliffDate);
                } else {
                  const interval = g.vestingSchedule === "monthly" ? 1 : g.vestingSchedule === "quarterly" ? 3 : 12;
                  const monthsSinceStart = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
                  const nextMonth = Math.ceil(monthsSinceStart / interval) * interval;
                  const nextDate = new Date(start);
                  nextDate.setMonth(nextDate.getMonth() + nextMonth);
                  nextVest = fmtDate(nextDate);
                }
              } else if (vested >= total) {
                nextVest = "Fully vested";
              }
              return [
                sh?.name || "-", fmtDate(g.grantDate), g.vestingSchedule || "-",
                g.cliffMonths?.toString() || "-", g.totalVestingMonths?.toString() || "-",
                fmtNum(total), fmtNum(vested), fmtNum(unvested), nextVest, g.status || "-",
              ];
            });
            break;
          }

          case "rsu_release": {
            title = "RSU Release Report";
            headers = ["Stakeholder", "Grant Date", "RSU Shares", "Vested/Released", "Unreleased", "Price/Share", "Value Released", "Status"];
            const rsuGrants = grants.filter(g => g.grantType === "rsu");
            rows = rsuGrants.map(g => {
              const sh = stakeholderMap.get(g.stakeholderId!);
              const total = parseFloat(g.shares || "0");
              const vested = parseFloat(g.sharesVested || "0");
              const price = parseFloat(g.pricePerShare || "0");
              return [
                sh?.name || "-", fmtDate(g.grantDate), fmtNum(total), fmtNum(vested),
                fmtNum(Math.max(0, total - vested)), price.toFixed(4),
                (vested * price).toLocaleString("en-US", { style: "currency", currency: "USD" }), g.status || "-",
              ];
            });
            break;
          }

          case "implied_ownership":
          case "stakeholder_ownership": {
            title = input.reportType === "implied_ownership" ? "Implied Ownership Report" : "Stakeholder Ownership Report";
            headers = ["Stakeholder", "Type", "Total Shares", "Vested", "Options (Unexercised)", "Fully Diluted Shares", "% Ownership (Fully Diluted)"];
            const fullyDiluted = totalSharesNum; // all grants count toward fully diluted
            rows = allStakeholders.map(s => {
              const sGrants = grants.filter(g => g.stakeholderId === s.id);
              const totalShares = sGrants.reduce((a, g) => a + parseFloat(g.shares || "0"), 0);
              const vested = sGrants.reduce((a, g) => a + parseFloat(g.sharesVested || "0"), 0);
              const options = sGrants
                .filter(g => g.grantType === "option_iso" || g.grantType === "option_nso")
                .reduce((a, g) => a + parseFloat(g.shares || "0") - parseFloat(g.sharesExercised || "0"), 0);
              const pct = fullyDiluted > 0 ? (totalShares / fullyDiluted) * 100 : 0;
              return [s.name, s.type, fmtNum(totalShares), fmtNum(vested), fmtNum(Math.max(0, options)), fmtNum(totalShares), fmtPct(pct)];
            }).filter(r => r[2] !== "0");
            break;
          }

          case "granted_securities": {
            title = "Granted Securities Report";
            headers = ["Stakeholder", "Share Class", "Grant Type", "Grant Date", "Shares", "Price/Share", "Total Value", "Status"];
            let filteredGrants = grants;
            if (input.startDate) {
              const start = new Date(input.startDate);
              filteredGrants = filteredGrants.filter(g => g.grantDate && new Date(g.grantDate) >= start);
            }
            if (input.endDate) {
              const end = new Date(input.endDate);
              filteredGrants = filteredGrants.filter(g => g.grantDate && new Date(g.grantDate) <= end);
            }
            rows = filteredGrants.map(g => {
              const sh = stakeholderMap.get(g.stakeholderId!);
              const sc = shareClassMap.get(g.shareClassId!);
              return [
                sh?.name || "-", sc?.name || "-", g.grantType, fmtDate(g.grantDate),
                g.shares || "0", g.pricePerShare || "-", g.totalValue || "-", g.status || "-",
              ];
            });
            break;
          }

          case "securities_cancelled": {
            title = "Securities Cancelled Report";
            headers = ["Stakeholder", "Type", "Date", "Shares Cancelled", "Grant Type", "Notes"];
            let cancelTx = transactions.filter(t => t.type === "cancel" || t.type === "expire" || t.type === "forfeit");
            if (input.startDate) {
              const start = new Date(input.startDate);
              cancelTx = cancelTx.filter(t => t.transactionDate && new Date(t.transactionDate) >= start);
            }
            if (input.endDate) {
              const end = new Date(input.endDate);
              cancelTx = cancelTx.filter(t => t.transactionDate && new Date(t.transactionDate) <= end);
            }
            rows = cancelTx.map(t => {
              const sh = stakeholderMap.get(t.stakeholderId!);
              return [sh?.name || "-", t.type, fmtDate(t.transactionDate), t.shares || "0", "-", t.notes || "-"];
            });
            // Also include cancelled grants
            let cancelledGrants = grants.filter(g => g.status === "cancelled" || g.status === "expired");
            if (input.startDate) {
              const start = new Date(input.startDate);
              cancelledGrants = cancelledGrants.filter(g => g.grantDate && new Date(g.grantDate) >= start);
            }
            if (input.endDate) {
              const end = new Date(input.endDate);
              cancelledGrants = cancelledGrants.filter(g => g.grantDate && new Date(g.grantDate) <= end);
            }
            for (const g of cancelledGrants) {
              const sh = stakeholderMap.get(g.stakeholderId!);
              rows.push([sh?.name || "-", g.status || "-", fmtDate(g.grantDate), g.shares || "0", g.grantType, g.notes || "-"]);
            }
            break;
          }

          case "iso_disqualifying": {
            title = "ISO Disqualifying Disposition Report";
            headers = ["Stakeholder", "Grant Date", "Exercise Date", "Shares", "Exercise Price", "FMV at Exercise", "Disposition Status", "Holding Period (yr)"];
            const isoGrants = grants.filter(g => g.grantType === "option_iso" && parseFloat(g.sharesExercised || "0") > 0);
            rows = isoGrants.map(g => {
              const sh = stakeholderMap.get(g.stakeholderId!);
              const exerciseTx = transactions.find(t => t.grantId === g.id && t.type === "exercise");
              const exerciseDate = exerciseTx?.transactionDate || null;
              const grantDate = g.grantDate ? new Date(g.grantDate) : null;
              const exDate = exerciseDate ? new Date(exerciseDate) : null;
              let holdingYears = "-";
              let status = "Qualifying";
              if (grantDate && exDate) {
                const years = (new Date().getTime() - exDate.getTime()) / (365.25 * 24 * 3600 * 1000);
                holdingYears = years.toFixed(1);
                const grantYears = (exDate.getTime() - grantDate.getTime()) / (365.25 * 24 * 3600 * 1000);
                // ISO qualifying: held 2+ years from grant, 1+ year from exercise
                if (years < 1 || grantYears < 2) status = "Disqualifying";
              }
              let fmvAtExercise = "-";
              if (exDate && valuations.length > 0) {
                const closest = valuations.reduce((prev, curr) => {
                  const prevDiff = Math.abs(new Date(prev.valuationDate).getTime() - exDate.getTime());
                  const currDiff = Math.abs(new Date(curr.valuationDate).getTime() - exDate.getTime());
                  return currDiff < prevDiff ? curr : prev;
                });
                fmvAtExercise = closest.fairMarketValue || "-";
              }
              return [
                sh?.name || "-", fmtDate(g.grantDate), fmtDate(exerciseDate),
                g.sharesExercised || "0", g.exercisePrice || g.pricePerShare || "-",
                fmvAtExercise, status, holdingYears,
              ];
            });
            break;
          }

          case "rsa_rsu_settlement": {
            title = "RSA/RSU Settlement Report";
            headers = ["Stakeholder", "Grant Type", "Grant Date", "Total Shares", "Settled (Vested)", "Unsettled", "Price/Share", "Settlement Value", "Status"];
            let rsaRsuGrants = grants.filter(g => g.grantType === "rsu" || g.grantType === "restricted_stock");
            if (input.startDate) {
              const start = new Date(input.startDate);
              rsaRsuGrants = rsaRsuGrants.filter(g => g.grantDate && new Date(g.grantDate) >= start);
            }
            if (input.endDate) {
              const end = new Date(input.endDate);
              rsaRsuGrants = rsaRsuGrants.filter(g => g.grantDate && new Date(g.grantDate) <= end);
            }
            rows = rsaRsuGrants.map(g => {
              const sh = stakeholderMap.get(g.stakeholderId!);
              const total = parseFloat(g.shares || "0");
              const settled = parseFloat(g.sharesVested || "0");
              const price = parseFloat(g.pricePerShare || "0");
              return [
                sh?.name || "-", g.grantType === "rsu" ? "RSU" : "RSA", fmtDate(g.grantDate),
                fmtNum(total), fmtNum(settled), fmtNum(Math.max(0, total - settled)),
                price.toFixed(4), (settled * price).toLocaleString("en-US", { style: "currency", currency: "USD" }), g.status || "-",
              ];
            });
            break;
          }

          default: {
            title = "Report";
            headers = ["Info"];
            rows = [["No specific report generator for type: " + input.reportType]];
            break;
          }
        }

        return { headers, rows, title, generatedAt };
      }),
  });
