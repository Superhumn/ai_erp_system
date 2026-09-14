// appRouter.recipes — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import * as manufacturingDb from "../db/manufacturing";
import { getGoogleSheetValues } from "../_core/googleWorkspace";
import { suggestColumnMapping, type ColumnKey } from "../recipeSheetImport";
import { opsProcedure, createAuditLog, getValidGoogleToken, requireRecipeAccess, importFormulationRows } from "./_shared";

export const recipesRouter = router({
    list: protectedProcedure
      .input(z.object({
        category: z.string().optional(),
        status: z.string().optional(),
        isSubRecipe: z.boolean().optional(),
      }).optional())
      .query(({ input, ctx }) => manufacturingDb.getRecipesForUser(ctx.user.id, input)),
    create: protectedProcedure
      .input(z.object({
        recipeId: z.string().min(1),
        name: z.string().min(1),
        category: z.enum(["beef", "pork", "chicken", "seafood", "dairy", "blend", "other"]).default("other"),
        status: z.enum(["development", "production", "discontinued"]).default("development"),
        version: z.number().default(1),
        isSubRecipe: z.boolean().optional(),
        baseBatchGrams: z.string().default("0"),
        expectedYieldPct: z.string().default("1.0000"),
        hasMoistureVariants: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => manufacturingDb.createRecipe({ ...input, createdBy: ctx.user?.id })),
    batchCost: protectedProcedure
      .input(z.object({
        id: z.number(),
        formulation: z.enum(["wet", "dry"]).default("wet"),
        batchGrams: z.number().optional(),
        scaleFactor: z.number().optional(),
        targetLbs: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        await requireRecipeAccess(ctx.user.id, input.id, "view");
        return manufacturingDb.calculateRecipeBatchCost({
          recipeId: input.id,
          formulation: input.formulation,
          batchGrams: input.batchGrams,
          scaleFactor: input.scaleFactor,
          targetLbs: input.targetLbs,
        });
      }),
    saveBatchSnapshot: protectedProcedure
      .input(z.object({
        recipeId: z.number(),
        formulationType: z.enum(["wet", "dry"]),
      }))
      .mutation(async ({ input, ctx }) => {
        await requireRecipeAccess(ctx.user.id, input.recipeId, "view");
        const cost = await manufacturingDb.calculateRecipeBatchCost({
          recipeId: input.recipeId,
          formulation: input.formulationType,
        });
        if (!cost) throw new Error("Unable to calculate recipe cost");
        return manufacturingDb.saveBatchCostSnapshot({
          recipeId: input.recipeId,
          formulationType: input.formulationType,
          totalBatchGrams: String(cost.totalBatchGrams),
          totalBatchCost: String(cost.totalCost),
          costPerGram: String(cost.costPerGram),
          costPerLb: String(cost.costPerLb),
          costPerKg: String(cost.costPerKg),
          yieldAdjustedCostPerLb: String(cost.yieldAdjustedCostPerLb),
          ingredientCosts: cost.lines,
          snapshotDate: new Date(),
        });
      }),
    syncToBom: protectedProcedure
      .input(z.object({
        recipeId: z.number(),
        productId: z.number(),
        formulation: z.enum(["wet", "dry"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await requireRecipeAccess(ctx.user.id, input.recipeId, "edit");
        return db.syncRecipeToBom(input.recipeId, input.productId, {
          userId: ctx.user?.id,
          formulation: input.formulation,
        });
      }),
    // --- Per-user access grants (recipe owner only) ---
    // List who currently has access to a recipe (besides the owner).
    listAccess: protectedProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireRecipeAccess(ctx.user.id, input.recipeId, "own");
        return manufacturingDb.listRecipeAccessGrants(input.recipeId);
      }),
    // Grant a specific user access to a recipe, identified by email.
    grant: protectedProcedure
      .input(z.object({
        recipeId: z.number(),
        email: z.string().email(),
        canEdit: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await requireRecipeAccess(ctx.user.id, input.recipeId, "own");
        const target = await db.getUserByEmail(input.email.trim().toLowerCase());
        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `No user found with email ${input.email}. They must have an account first.`,
          });
        }
        const result = await manufacturingDb.grantRecipeAccess({
          recipeId: input.recipeId,
          userId: target.id,
          canEdit: input.canEdit,
          grantedBy: ctx.user.id,
        });
        await createAuditLog(
          ctx.user.id,
          result.created ? "create" : "update",
          "recipe_access_grant",
          result.id,
          `recipe:${input.recipeId} → user:${target.id} (${input.canEdit ? "edit" : "view"})`,
        );
        return { ...result, userId: target.id };
      }),
    // Revoke a user's access to a recipe.
    revoke: protectedProcedure
      .input(z.object({ recipeId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireRecipeAccess(ctx.user.id, input.recipeId, "own");
        // Capture the grant row id before deleting so the audit log references
        // the grant itself (consistent with the grant path), not the recipe id.
        const existing = await manufacturingDb.listRecipeAccessGrants(input.recipeId);
        const grant = existing.find((g) => g.userId === input.userId);
        await manufacturingDb.revokeRecipeAccess(input.recipeId, input.userId);
        await createAuditLog(
          ctx.user.id,
          "delete",
          "recipe_access_grant",
          grant?.id ?? input.recipeId,
          `recipe:${input.recipeId} × user:${input.userId}`,
        );
        return { success: true };
      }),
    // Import recipe formulations from a Google Spreadsheet. Imported recipes are
    // owned by the importer, so they stay private until access is granted.
    importFromGoogleSheet: protectedProcedure
      .input(z.object({
        spreadsheetId: z.string().min(1),
        range: z.string().optional(),
        defaultRecipeName: z.string().optional(),
        // Optional explicit column mapping (field → column index) that
        // overrides automatic header detection.
        columnMapping: z.record(z.string(), z.number()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: error });
        }
        const sheet = await getGoogleSheetValues(
          accessToken,
          input.spreadsheetId,
          input.range || "A1:Z1000",
        );
        if (!sheet.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: sheet.error || "Failed to read the spreadsheet.",
          });
        }
        return importFormulationRows(
          (sheet.values as unknown[][]) || [],
          ctx.user.id,
          {
            defaultRecipeName: input.defaultRecipeName,
            columnMapping: input.columnMapping as Partial<Record<ColumnKey, number>> | undefined,
          },
        );
      }),
    // Read a sheet's header row (plus a few sample rows) and suggest a column
    // mapping, so the import UI can let the user review/adjust which column maps
    // to which recipe field before importing. Read-only — nothing is persisted.
    previewGoogleSheet: protectedProcedure
      .input(z.object({
        spreadsheetId: z.string().min(1),
        range: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const { accessToken, error } = await getValidGoogleToken(ctx.user.id);
        if (error) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: error });
        }
        const sheet = await getGoogleSheetValues(
          accessToken,
          input.spreadsheetId,
          input.range || "A1:Z1000",
        );
        if (!sheet.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: sheet.error || "Failed to read the spreadsheet.",
          });
        }
        const values = (sheet.values as unknown[][]) || [];
        const header = (values[0] as unknown[]) || [];
        return {
          headers: header.map((h) => String(h ?? "")),
          sampleRows: values.slice(1, 6).map((r) => (r as unknown[]).map((c) => String(c ?? ""))),
          suggestedMapping: suggestColumnMapping(header),
        };
      }),
    // Suggest a column mapping for a header row parsed on the client (file
    // upload path), keeping the auto-detection logic on the server as the single
    // source of truth.
    suggestImportMapping: protectedProcedure
      .input(z.object({ headers: z.array(z.string()).max(200) }))
      .query(({ input }) => suggestColumnMapping(input.headers)),
    // Import recipe formulations from an uploaded CSV/XLSX file. The client
    // parses the file into a 2D array of rows (header row first) and sends it
    // here, so no Google account or hosted sheet is required. Same parsing and
    // ownership rules as importFromGoogleSheet.
    importFromRows: protectedProcedure
      .input(z.object({
        rows: z.array(z.array(z.any())).max(10000),
        defaultRecipeName: z.string().optional(),
        columnMapping: z.record(z.string(), z.number()).optional(),
      }))
      .mutation(({ input, ctx }) =>
        importFormulationRows(input.rows as unknown[][], ctx.user.id, {
          defaultRecipeName: input.defaultRecipeName,
          columnMapping: input.columnMapping as Partial<Record<ColumnKey, number>> | undefined,
        })),
    // List copackers a recipe is shared with (owner only)
    listShares: opsProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireRecipeAccess(ctx.user.id, input.recipeId, "own");
        return manufacturingDb.getRecipeShares(input.recipeId);
      }),
    // Share (or update share settings) for a recipe with a copacker warehouse
    share: opsProcedure
      .input(z.object({
        recipeId: z.number(),
        warehouseId: z.number(),
        shareIngredients: z.boolean().optional(),
        shareProcedures: z.boolean().optional(),
        notes: z.string().nullish(),
      }))
      .mutation(async ({ input, ctx }) => {
        await requireRecipeAccess(ctx.user.id, input.recipeId, "own");
        const warehouse = await db.getWarehouseById(input.warehouseId);
        if (!warehouse) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Warehouse not found" });
        }
        if (warehouse.type !== "copacker") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Recipes can only be shared with warehouses of type 'copacker'",
          });
        }
        const result = await manufacturingDb.upsertRecipeShare({
          recipeId: input.recipeId,
          warehouseId: input.warehouseId,
          shareIngredients: input.shareIngredients,
          shareProcedures: input.shareProcedures,
          notes: input.notes === undefined ? undefined : input.notes,
          sharedBy: ctx.user?.id,
        });
        await createAuditLog(
          ctx.user.id,
          result.created ? "create" : "update",
          "recipe_copacker_share",
          result.id,
          `recipe:${input.recipeId} → warehouse:${input.warehouseId}`,
        );
        return result;
      }),
    unshare: opsProcedure
      .input(z.object({ recipeId: z.number(), warehouseId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireRecipeAccess(ctx.user.id, input.recipeId, "own");
        const existingShares = await manufacturingDb.getRecipeShares(input.recipeId);
        const shareToRemove = existingShares.find((share) => share.warehouseId === input.warehouseId);

        await manufacturingDb.removeRecipeShare(input.recipeId, input.warehouseId);

        if (shareToRemove) {
          await createAuditLog(
            ctx.user.id,
            "delete",
            "recipe_copacker_share",
            shareToRemove.id,
            `recipe:${input.recipeId} × warehouse:${input.warehouseId}`,
          );
        }
        return { success: true };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireRecipeAccess(ctx.user.id, input.id, "own");
        await manufacturingDb.deleteRecipe(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'recipe', input.id);
        return { success: true };
      }),
  });
