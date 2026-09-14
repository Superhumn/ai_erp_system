// appRouter.vendors — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getCompanyWebSources, sourceCompanyContacts, sourceCompanyContactsBatch } from "../companyContactSourcing";
import * as db from "../db";
import { scopeAllows } from "../_core/scope";
import { adminProcedure, opsProcedure, resolveRequestScope, scopedProcedure, createAuditLog } from "./_shared";

// ============================================
// VENDOR MANAGEMENT
// ============================================
export const vendorsRouter = router({
    // Scope derived server-side from the caller's entity access (ctx.scope), never from client input.
    list: scopedProcedure
      .query(({ ctx }) => db.getVendors(ctx.scope)),
    get: scopedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input, ctx }) => db.getVendorById(input.id, ctx.scope)),
    create: opsProcedure
      .input(z.object({
        name: z.string().min(1),
        companyId: z.number().optional(),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        postalCode: z.string().optional(),
        type: z.enum(['supplier', 'contractor', 'service']).optional(),
        paymentTerms: z.number().optional(),
        defaultLeadTimeDays: z.number().optional(),
        taxId: z.string().optional(),
        website: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Can't create a vendor under an entity the caller doesn't have access to.
        if (input.companyId != null) {
          const scope = await resolveRequestScope(ctx.user);
          if (!scopeAllows(scope, input.companyId)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot create a vendor under an entity outside your access.' });
          }
        }
        const result = await db.createVendor(input);
        await createAuditLog(ctx.user.id, 'create', 'vendor', result.id, input.name);
        return result;
      }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        status: z.enum(['active', 'inactive', 'pending']).optional(),
        paymentTerms: z.number().optional(),
        defaultLeadTimeDays: z.number().optional(),
        notes: z.string().optional(),
        whatsappNumber: z.string().optional(),
        website: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateVendor(id, data);
        await createAuditLog(ctx.user.id, 'update', 'vendor', id);
        return { success: true };
      }),
    delete: opsProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteVendor(input.id);
        await createAuditLog(ctx.user.id, 'delete', 'vendor', input.id);
        return { success: true };
      }),

    // Try to find a CRM contact for this vendor by matching phone/whatsapp/email.
    // If found, auto-link and return the contact. If not, return null so the
    // client can fall back to the manual picker / "add new contact" flow.
    autoLinkContact: opsProcedure
      .input(z.object({ vendorId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const vendor = await db.getVendorById(input.vendorId, await resolveRequestScope(ctx.user));
        if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
        if (vendor.contactId) {
          const contact = await db.getCrmContactById(vendor.contactId);
          if (contact) return { contact, autoLinked: false };
        }
        const match = await db.findCrmContactForVendor({
          phone: vendor.phone,
          whatsappNumber: vendor.whatsappNumber,
          email: vendor.email,
        });
        if (!match) return { contact: null, autoLinked: false };
        await db.linkVendorContact(input.vendorId, match.id);
        await createAuditLog(ctx.user.id, "update", "vendor", input.vendorId, vendor.name, null, { contactId: match.id, autoLinked: true });
        return { contact: match, autoLinked: true };
      }),

    linkContact: opsProcedure
      .input(z.object({
        vendorId: z.number(),
        contactId: z.number(),
        whatsappNumber: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const vendor = await db.getVendorById(input.vendorId, await resolveRequestScope(ctx.user));
        if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
        await db.linkVendorContact(input.vendorId, input.contactId, input.whatsappNumber);
        await createAuditLog(ctx.user.id, "update", "vendor", input.vendorId, vendor.name, null, { contactId: input.contactId });
        return { success: true };
      }),

    unlinkContact: opsProcedure
      .input(z.object({ vendorId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const vendor = await db.getVendorById(input.vendorId, await resolveRequestScope(ctx.user));
        if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
        await db.unlinkVendorContact(input.vendorId);
        await createAuditLog(ctx.user.id, "update", "vendor", input.vendorId, vendor.name, null, { contactId: null });
        return { success: true };
      }),

    /**
     * Read this vendor's own website and fill in contact details from it.
     *
     * Only values found on a page served by the vendor's own domain are written,
     * and only an own-domain email marks the record verified — see
     * `server/companyWebsiteSource.ts`. Existing details are kept unless the
     * caller explicitly asks to overwrite them.
     */
    sourceFromWebsite: opsProcedure
      .input(z.object({
        vendorId: z.number(),
        website: z.string().optional(),
        overwriteExisting: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const vendor = await db.getVendorById(input.vendorId);
        if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
        const result = await sourceCompanyContacts({
          entityType: "vendor",
          entityId: input.vendorId,
          website: input.website,
          overwriteExisting: input.overwriteExisting,
          requestedBy: ctx.user.id,
        });
        await createAuditLog(
          ctx.user.id, "update", "vendor", input.vendorId, vendor.name, null,
          { contactSourcing: result.status, verified: result.verified, applied: result.applied },
        );
        return result;
      }),

    /** Every attempt to read this vendor's website, newest first. */
    webSources: protectedProcedure
      .input(z.object({ vendorId: z.number(), limit: z.number().min(1).max(100).optional() }))
      .query(({ input }) => getCompanyWebSources("vendor", input.vendorId, input.limit)),

    /**
     * Re-source a batch of vendors. Serial by design — see
     * `sourceCompanyContactsBatch`.
     */
    sourceFromWebsiteBatch: opsProcedure
      .input(z.object({
        vendorIds: z.array(z.number()).min(1).max(25),
        overwriteExisting: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const summary = await sourceCompanyContactsBatch(
          Array.from(new Set(input.vendorIds)).map(entityId => ({ entityType: "vendor" as const, entityId })),
          { overwriteExisting: input.overwriteExisting, requestedBy: ctx.user.id },
        );
        await createAuditLog(
          ctx.user.id, "update", "vendor", 0,
          `Sourced contacts from ${input.vendorIds.length} vendor websites (${summary.verifiedCount} verified)`,
        );
        return summary;
      }),

    searchAlibaba: protectedProcedure
      .input(z.object({
        query: z.string().min(1),
        category: z.string().optional(),
        minOrder: z.string().optional(),
        country: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const query = input.query.trim();
        const defaultCountry = input.country?.trim() || "China";
        const fallbackSuppliers = Array.from({ length: 8 }, (_, i) => {
          const priceFloor = (0.6 + i * 0.35).toFixed(2);
          const priceCeil = (1.8 + i * 0.55).toFixed(2);
          const moq = 100 + i * 50;
          const years = 3 + i;
          const rating = Math.min(5, 4 + i * 0.1).toFixed(1);
          const verified = i % 2 === 0 || i % 3 === 0;
          const slug = query
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "") || "product";
          const companyPrefixes = [
            "Shenzhen",
            "Guangzhou",
            "Ningbo",
            "Dongguan",
            "Wenzhou",
            "Yiwu",
            "Qingdao",
            "Foshan",
          ];
          const companyTypes = [
            "Industrial",
            "Trading",
            "Technology",
            "Manufacturing",
            "Supply Chain",
            "Commerce",
            "Export",
            "Materials",
          ];
          const firstWord = query.split(" ")[0] || "Global";
          return {
            companyName: `${companyPrefixes[i]} ${firstWord} ${companyTypes[i]} Co., Ltd.`,
            productName: `${query} - Model ${String.fromCharCode(65 + i)}`,
            priceRange: `$${priceFloor} - $${priceCeil}`,
            minOrder: `${moq} Pieces`,
            country: defaultCountry,
            yearsInBusiness: years,
            responseRate: `${(88 + i).toFixed(1)}%`,
            rating: Number(rating),
            verified,
            alibabaUrl: `https://www.alibaba.com/product-detail/${slug}_${String(62345678901 + i)}.html`,
          };
        });

        const prompt = `You are an international trade and procurement expert. Search Alibaba.com for suppliers matching this query:
Product/Search: ${input.query}
${input.category ? `Category: ${input.category}` : ''}
${input.minOrder ? `Minimum Order Preference: ${input.minOrder}` : ''}
${input.country ? `Supplier Country: ${input.country}` : ''}

Return a JSON array of 8 realistic Alibaba supplier results. Each object must have these fields:
- companyName: realistic Chinese or international manufacturer/trading company name
- productName: specific product matching the search query
- priceRange: price range string like "$0.50 - $2.00" or "$150.00 - $300.00" per unit
- minOrder: minimum order quantity string like "100 Pieces" or "1 Ton"
- country: supplier country (default to China if not specified)
- yearsInBusiness: number of years (1-20)
- responseRate: percentage string like "92.5%"
- rating: number 3.0-5.0 with one decimal
- verified: boolean (true for Gold Supplier or Verified status, roughly 60% should be true)
- alibabaUrl: realistic Alibaba product URL like "https://www.alibaba.com/product-detail/Product-Name_62345678901.html"

Make the results diverse with different price points, company sizes, and specialties. Use realistic company naming patterns (e.g. "Shenzhen Hongda Electronics Co., Ltd.", "Yiwu Bright Trading Co., Ltd.").

ONLY return the JSON array, no other text.`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "You are an international trade expert. Return only valid JSON arrays." },
              { role: "user", content: prompt },
            ],
          });

          const content = response.choices?.[0]?.message?.content || "[]";
          try {
            const text = typeof content === "string" ? content : String(content);
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            const suppliers = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
            return { suppliers: suppliers.slice(0, 10), usedFallback: false };
          } catch {
            return { suppliers: fallbackSuppliers, usedFallback: true };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isProviderOverloaded =
            message.includes("529") ||
            message.toLowerCase().includes("overloaded_error") ||
            message.toLowerCase().includes("overloaded");

          if (isProviderOverloaded) {
            return { suppliers: fallbackSuppliers, usedFallback: true };
          }

          throw error;
        }
      }),

    // Look up a vendor's real business details online from a natural-language
    // request (e.g. "add BCW as a warehouse vendor"). Uses the LLM with live
    // web search to find the company's publicly-listed contact info and returns
    // a pre-filled draft for the user to review — it does NOT create the vendor,
    // keeping a human in the loop before a record is written.
    enrichFromText: opsProcedure
      .input(z.object({ text: z.string().min(1).max(2000) }))
      .mutation(async ({ input }) => {
        const prompt = `A user wants to add a vendor (supplier) to their ERP system. Their request:
"${input.text}"

Use web search to identify the specific real company the user most likely means and find its publicly-listed business details. Use any hints in the request (industry, role, location, e.g. "warehouse", "3PL", "packaging supplier") to disambiguate. Prefer the company's official website and reputable business directories.

Return ONLY a JSON object with these fields. Use null for anything you cannot verify from public sources — NEVER invent or guess contact details:
- name: official company name
- contactName: a general/sales contact person if publicly listed, else null
- email: general or sales contact email if publicly listed, else null
- phone: main phone number (international format) if listed, else null
- address: street address line only, else null
- city, state, country, postalCode: location parts, else null
- website: primary website URL, else null
- type: one of "supplier", "contractor", "service" — best fit for how this vendor would be used
- notes: 1-2 sentence description of what the company does. End with the website URL if known.
- confidence: "high" | "medium" | "low" — how sure you are this is the right company with correct details
- sources: array of the source URLs you actually used`;

        const enrichmentSchema = {
          type: "object" as const,
          properties: {
            name: { type: ["string", "null"] },
            contactName: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            address: { type: ["string", "null"] },
            city: { type: ["string", "null"] },
            state: { type: ["string", "null"] },
            country: { type: ["string", "null"] },
            postalCode: { type: ["string", "null"] },
            website: { type: ["string", "null"] },
            type: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
            confidence: { type: ["string", "null"] },
            sources: { type: "array", items: { type: "string" } },
          },
          required: ["name"],
          additionalProperties: false,
        };

        let raw: Record<string, any> | null = null;
        try {
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "You are a procurement research assistant. You look up real companies online and return accurate, verifiable business details. Never fabricate contact information — use null when a value cannot be verified from public sources.",
              },
              { role: "user", content: prompt },
            ],
            webSearch: { maxUses: 5 },
            toolChoice: "auto",
            maxTokens: 2000,
            response_format: {
              type: "json_schema",
              json_schema: { name: "vendor_enrichment", strict: false, schema: enrichmentSchema },
            },
          });

          const content = response.choices?.[0]?.message?.content;
          const textOut = typeof content === "string" ? content.trim() : "";
          try {
            // The model is instructed to return only a JSON object, so parse the
            // whole payload first (handles braces inside string fields correctly).
            raw = textOut ? JSON.parse(textOut) : null;
          } catch {
            // Fallback: pull out the outermost {...} if the model added any prose.
            const jsonMatch = textOut.match(/\{[\s\S]*\}/);
            raw = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
          }
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Online vendor lookup failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }

        const clean = (v: unknown): string | undefined =>
          typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;

        // Require a real, non-empty string name — reject objects/numbers/blank.
        // (Guarding `raw` here also narrows it to non-null for the accesses below;
        // a null `raw` already yields an empty name and returns.)
        const name = clean(raw?.name);
        if (!raw || !name) {
          return { found: false as const, vendor: null, sources: [] as string[], confidence: "low" as const };
        }

        const vendorType = clean(raw.type)?.toLowerCase();
        const rawConfidence = clean(raw.confidence)?.toLowerCase();
        const confidence: "high" | "medium" | "low" =
          rawConfidence === "high" || rawConfidence === "low" ? rawConfidence : "medium";
        const vendor = {
          name,
          contactName: clean(raw.contactName),
          email: clean(raw.email),
          phone: clean(raw.phone),
          address: clean(raw.address),
          city: clean(raw.city),
          state: clean(raw.state),
          country: clean(raw.country),
          postalCode: clean(raw.postalCode),
          website: clean(raw.website),
          type: vendorType && ["supplier", "contractor", "service"].includes(vendorType) ? vendorType : "supplier",
          notes: clean(raw.notes),
        };

        return {
          found: true as const,
          vendor,
          sources: Array.isArray(raw.sources)
            ? (raw.sources as unknown[])
                .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
                .map(s => s.trim())
                .slice(0, 10)
            : [],
          confidence,
        };
      }),
  });
