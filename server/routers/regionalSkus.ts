// appRouter.regionalSkus — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { opsProcedure } from "./_shared";

// ============================================
// REGIONAL SKUs  (SH-BWS-001 ↔ SH-BWS-001-SA, etc.)
// ============================================
export const regionalSkusRouter = router({
    list: protectedProcedure
      .input(z.object({
        productId: z.number().optional(),
        region: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { productRegionalSkus } = await import("../../drizzle/schema");
        const conditions: any[] = [];
        if (input?.productId) conditions.push(eq(productRegionalSkus.productId, input.productId));
        if (input?.region) conditions.push(eq(productRegionalSkus.region, input.region));
        const q = database.select().from(productRegionalSkus);
        return conditions.length ? await q.where(and(...conditions)) : await q;
      }),

    create: opsProcedure
      .input(z.object({
        productId: z.number(),
        region: z.string().min(2).max(8),
        regionalSku: z.string().min(1).max(64),
        barcode: z.string().optional(),
        barcodeType: z.enum(["ean13", "upc", "gtin14", "code128", "other"]).optional(),
        gs1Prefix: z.string().optional(),
        localName: z.string().optional(),
        localDescription: z.string().optional(),
        packagingFormat: z.string().optional(),
        status: z.enum(["planned", "active", "discontinued"]).default("planned"),
        launchedAt: z.coerce.date().optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { productRegionalSkus } = await import("../../drizzle/schema");
        const result = await database.insert(productRegionalSkus).values(input as any);
        return { id: (result as any)[0]?.insertId ?? (result as any).insertId };
      }),

    update: opsProcedure
      .input(z.object({
        id: z.number(),
        patch: z.object({
          regionalSku: z.string().optional(),
          barcode: z.string().optional(),
          status: z.enum(["planned", "active", "discontinued"]).optional(),
          launchedAt: z.coerce.date().optional(),
          localName: z.string().optional(),
          localDescription: z.string().optional(),
          packagingFormat: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { productRegionalSkus } = await import("../../drizzle/schema");
        await database.update(productRegionalSkus).set(input.patch as any).where(eq(productRegionalSkus.id, input.id));
        return { ok: true };
      }),
  });
