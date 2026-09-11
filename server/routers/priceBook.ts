// appRouter.priceBook — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, lte, gte, or, isNull } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { opsProcedure } from "./_shared";

// ============================================
// MULTI-TIER PRICE BOOK  (foodservice / wholesale / MSRP per region)
// ============================================
export const priceBookRouter = router({
    listTiers: protectedProcedure
      .input(z.object({
        productId: z.number().optional(),
        region: z.string().optional(),
        channel: z.enum(["foodservice", "wholesale", "retail_msrp", "retail_dtc", "export", "institutional", "online", "other"]).optional(),
        activeOnly: z.boolean().default(true),
      }).optional())
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { productPriceTiers } = await import("../../drizzle/schema");
        const conditions: any[] = [];
        if (input?.productId) conditions.push(eq(productPriceTiers.productId, input.productId));
        if (input?.region) conditions.push(eq(productPriceTiers.region, input.region));
        if (input?.channel) conditions.push(eq(productPriceTiers.channel, input.channel));
        if (input?.activeOnly !== false) conditions.push(eq(productPriceTiers.status, "active"));
        const q = database.select().from(productPriceTiers);
        const rows = conditions.length ? await q.where(and(...conditions)) : await q;
        return rows;
      }),

    getTier: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { productPriceTiers, productVolumeDiscounts } = await import("../../drizzle/schema");
        const [tier] = await database.select().from(productPriceTiers).where(eq(productPriceTiers.id, input.id));
        if (!tier) throw new TRPCError({ code: 'NOT_FOUND', message: 'Price tier not found' });
        const bands = await database.select().from(productVolumeDiscounts)
          .where(eq(productVolumeDiscounts.priceTierId, input.id));
        return { ...tier, volumeDiscounts: bands };
      }),

    createTier: opsProcedure
      .input(z.object({
        productId: z.number(),
        region: z.string().min(2).max(8),
        channel: z.enum(["foodservice", "wholesale", "retail_msrp", "retail_dtc", "export", "institutional", "online", "other"]),
        currency: z.string().length(3),
        packSize: z.string().optional(),
        unitOfMeasure: z.string().default("kg"),
        pricePerUnit: z.string(),
        taxMode: z.enum(["exclusive", "inclusive", "exempt"]).default("exclusive"),
        taxRate: z.string().optional(),
        minOrderQty: z.string().optional(),
        effectiveFrom: z.coerce.date(),
        effectiveTo: z.coerce.date().optional(),
        contractOnly: z.boolean().default(false),
        notes: z.string().optional(),
        volumeDiscounts: z.array(z.object({
          minQty: z.string(),
          maxQty: z.string().optional(),
          discountPercent: z.string().default("0"),
          notes: z.string().optional(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { productPriceTiers, productVolumeDiscounts } = await import("../../drizzle/schema");
        const { volumeDiscounts, ...tierInput } = input;
        const result = await database.insert(productPriceTiers).values({
          ...tierInput,
          createdBy: ctx.user.id,
        } as any);
        const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
        if (volumeDiscounts && volumeDiscounts.length) {
          await database.insert(productVolumeDiscounts).values(
            volumeDiscounts.map(d => ({ ...d, priceTierId: insertId } as any)),
          );
        }
        return { id: insertId };
      }),

    updateTier: opsProcedure
      .input(z.object({
        id: z.number(),
        patch: z.object({
          pricePerUnit: z.string().optional(),
          taxRate: z.string().optional(),
          minOrderQty: z.string().optional(),
          effectiveTo: z.coerce.date().optional(),
          status: z.enum(["draft", "active", "superseded", "archived"]).optional(),
          notes: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { productPriceTiers } = await import("../../drizzle/schema");
        await database.update(productPriceTiers).set(input.patch as any).where(eq(productPriceTiers.id, input.id));
        return { ok: true };
      }),

    addVolumeDiscount: opsProcedure
      .input(z.object({
        priceTierId: z.number(),
        minQty: z.string(),
        maxQty: z.string().optional(),
        discountPercent: z.string().default("0"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { productVolumeDiscounts } = await import("../../drizzle/schema");
        const result = await database.insert(productVolumeDiscounts).values(input as any);
        return { id: (result as any)[0]?.insertId ?? (result as any).insertId };
      }),

    // Compute effective price including volume discount band, for a given product/region/channel/qty.
    quote: protectedProcedure
      .input(z.object({
        productId: z.number(),
        region: z.string(),
        channel: z.enum(["foodservice", "wholesale", "retail_msrp", "retail_dtc", "export", "institutional", "online", "other"]),
        quantity: z.number().positive(),
      }))
      .query(async ({ input }) => {
        const database = await db.getDb();
        if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
        const { productPriceTiers, productVolumeDiscounts } = await import("../../drizzle/schema");
        const now = new Date();
        const [tier] = await database.select().from(productPriceTiers).where(and(
          eq(productPriceTiers.productId, input.productId),
          eq(productPriceTiers.region, input.region),
          eq(productPriceTiers.channel, input.channel),
          eq(productPriceTiers.status, "active"),
          lte(productPriceTiers.effectiveFrom, now),
          or(isNull(productPriceTiers.effectiveTo), gte(productPriceTiers.effectiveTo, now)),
        )).orderBy(desc(productPriceTiers.effectiveFrom)).limit(1);
        if (!tier) return null;
        const bands = await database.select().from(productVolumeDiscounts)
          .where(eq(productVolumeDiscounts.priceTierId, tier.id));
        const qty = input.quantity;
        const band = bands.find(b => qty >= Number(b.minQty) && (b.maxQty == null || qty <= Number(b.maxQty)));
        const basePrice = Number(tier.pricePerUnit);
        const discountPct = band ? Number(band.discountPercent ?? 0) : 0;
        const effectivePerUnit = basePrice * (1 - discountPct / 100);
        return {
          tier,
          band,
          quantity: qty,
          basePricePerUnit: basePrice,
          discountPercent: discountPct,
          effectivePricePerUnit: effectivePerUnit,
          subtotal: effectivePerUnit * qty,
          currency: tier.currency,
          taxMode: tier.taxMode,
          taxRate: tier.taxRate,
        };
      }),
  });
