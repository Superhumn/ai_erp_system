// appRouter.products — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { opsProcedure, createAuditLog } from "./_shared";

// ============================================
// PRODUCT MANAGEMENT
// ============================================
export const productsRouter = router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(({ input }) => db.getProducts(input?.companyId)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getProductById(input.id)),
    create: opsProcedure
      .input(z.object({
        sku: z.string().optional().default(""),
        name: z.string().min(1),
        companyId: z.number().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        type: z.enum(['physical', 'digital', 'service']).optional(),
        manufacturingStage: z.enum(['raw_material', 'semi_finished_good', 'finished_product']).optional(),
        unitPrice: z.string().optional().default("0"),
        costPrice: z.string().optional(),
        currency: z.string().optional(),
        taxable: z.boolean().optional(),
        taxRate: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Auto-generate SKU if not provided
        const sku = input.sku || `SKU-${Date.now().toString(36).toUpperCase()}`;
        const result = await db.createProduct({ ...input, sku });
        await createAuditLog(ctx.user.id, 'create', 'product', result.id, input.name);
        return result;
      }),
    update: opsProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        type: z.enum(['physical', 'digital', 'service']).optional(),
        manufacturingStage: z.enum(['raw_material', 'semi_finished_good', 'finished_product']).optional(),
        unitPrice: z.string().optional(),
        costPrice: z.string().optional(),
        status: z.enum(['active', 'inactive', 'discontinued']).optional(),
        taxable: z.boolean().optional(),
        taxRate: z.string().optional(),
        preferredVendorId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateProduct(id, data);
        await createAuditLog(ctx.user.id, 'update', 'product', id);
        return { success: true };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteProduct(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'product', input.id);
        return { success: true };
      }),
  });
