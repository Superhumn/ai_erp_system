// appRouter.ingredients — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as manufacturingDb from "../db/manufacturing";

export const ingredientsRouter = router({
    list: protectedProcedure
      .input(z.object({ category: z.string().optional(), active: z.boolean().optional() }).optional())
      .query(({ input }) => manufacturingDb.getIngredients(input)),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        sku: z.string().min(1),
        category: z.enum(["protein", "spice", "liquid", "produce", "packaging", "other"]).default("other"),
        unitOfMeasure: z.enum(["g", "kg", "lb", "oz", "ml", "l", "each"]).default("g"),
        costPerUnit: z.string().default("0"),
        costUnit: z.enum(["per_lb", "per_kg", "per_oz", "per_each"]).default("per_kg"),
        supplierId: z.number().optional(),
        leadTimeDays: z.number().optional(),
        moistureContent: z.string().optional(),
        shelfLifeDays: z.number().optional(),
        isAllergen: z.boolean().optional(),
        allergenType: z.string().optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(({ input }) => manufacturingDb.createIngredient(input)),
    addCost: protectedProcedure
      .input(z.object({
        ingredientId: z.number(),
        costPerUnit: z.string(),
        costUnit: z.enum(["per_lb", "per_kg", "per_oz", "per_each"]),
        effectiveDate: z.date().optional(),
        supplierId: z.number().optional(),
        source: z.string().optional(),
      }))
      .mutation(({ input }) => manufacturingDb.addIngredientCostEntry({
        ...input,
        effectiveDate: input.effectiveDate || new Date(),
      })),
  });
