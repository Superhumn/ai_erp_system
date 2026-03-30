import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  certificatesOfAnalysis,
  productSpecifications,
  lotShipmentRecords,
  inventoryLots,
  products,
  coaTestResults,
  specParameters,
  nonConformanceReports,
  capaActions,
  labTestingLogs,
  lotTraceabilityLinks,
  shelfLifeAlerts,
  priceBooks,
  priceBookEntries,
  brokerCommissions,
  commissionTransactions,
  customerDeductions,
  customerSpecifications,
  customers,
  vendors,
} from "../drizzle/schema";

// ============================================================
// ROLE GUARDS
// ============================================================

const qualityProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "ops", "exec", "plant", "customer"].includes(ctx.user.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Quality Management access required",
    });
  }
  return next({ ctx });
});

const internalQualityProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "ops", "exec", "plant"].includes(ctx.user.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Internal quality access required",
    });
  }
  return next({ ctx });
});

// ============================================================
// QUALITY MANAGEMENT ROUTER
// ============================================================

export const qualityManagementRouter = router({

  // ----------------------------------------------------------
  // CERTIFICATES OF ANALYSIS (COAs)
  // ----------------------------------------------------------
  coas: router({
    /** List COAs — supports filtering by status, lotId, productId */
    list: qualityProcedure
      .input(
        z.object({
          status: z
            .enum(["draft", "pending_review", "approved", "rejected", "expired"])
            .optional(),
          lotId: z.number().optional(),
          productId: z.number().optional(),
          limit: z.number().min(1).max(500).default(200),
        }).optional()
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const conditions: ReturnType<typeof eq>[] = [];

        if (input?.status) {
          conditions.push(eq(certificatesOfAnalysis.status, input.status));
        }
        if (input?.lotId) {
          conditions.push(eq(certificatesOfAnalysis.lotId, input.lotId));
        }
        if (input?.productId) {
          conditions.push(eq(certificatesOfAnalysis.productId, input.productId));
        }

        const rows = await db
          .select({
            id: certificatesOfAnalysis.id,
            coaNumber: certificatesOfAnalysis.coaNumber,
            type: certificatesOfAnalysis.type,
            status: certificatesOfAnalysis.status,
            issueDate: certificatesOfAnalysis.issueDate,
            expiryDate: certificatesOfAnalysis.expiryDate,
            documentUrl: certificatesOfAnalysis.documentUrl,
            notes: certificatesOfAnalysis.notes,
            autoSendWithShipment: certificatesOfAnalysis.autoSendWithShipment,
            lotId: certificatesOfAnalysis.lotId,
            productId: certificatesOfAnalysis.productId,
            vendorId: certificatesOfAnalysis.vendorId,
            createdAt: certificatesOfAnalysis.createdAt,
            // joined fields
            lotNumber: inventoryLots.lotNumber,
            productName: products.name,
            productSku: products.sku,
          })
          .from(certificatesOfAnalysis)
          .leftJoin(
            inventoryLots,
            eq(certificatesOfAnalysis.lotId, inventoryLots.id)
          )
          .leftJoin(
            products,
            eq(certificatesOfAnalysis.productId, products.id)
          )
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(certificatesOfAnalysis.createdAt))
          .limit(input?.limit ?? 200);

        return rows;
      }),

    /** Get a single COA by id, including test results */
    get: qualityProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "NOT_FOUND", message: "COA not found" });

        const [coa] = await db
          .select()
          .from(certificatesOfAnalysis)
          .where(eq(certificatesOfAnalysis.id, input.id))
          .limit(1);

        if (!coa) {
          throw new TRPCError({ code: "NOT_FOUND", message: "COA not found" });
        }

        const testResults = await db
          .select()
          .from(coaTestResults)
          .where(eq(coaTestResults.coaId, input.id))
          .orderBy(coaTestResults.testCategory, coaTestResults.testName);

        return { ...coa, testResults };
      }),

    /** Create a new COA (internal ops/admin only) */
    create: internalQualityProcedure
      .input(
        z.object({
          coaNumber: z.string().min(1),
          lotId: z.number().optional(),
          productId: z.number().optional(),
          vendorId: z.number().optional(),
          type: z.enum([
            "incoming_raw_material",
            "in_process",
            "finished_product",
            "third_party",
          ]),
          status: z
            .enum(["draft", "pending_review", "approved", "rejected", "expired"])
            .default("draft"),
          issueDate: z.string().optional(),
          expiryDate: z.string().optional(),
          documentUrl: z.string().optional(),
          notes: z.string().optional(),
          autoSendWithShipment: z.boolean().default(true),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const result = await db.insert(certificatesOfAnalysis).values({
          coaNumber: input.coaNumber,
          lotId: input.lotId,
          productId: input.productId,
          vendorId: input.vendorId,
          type: input.type,
          status: input.status,
          issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          documentUrl: input.documentUrl,
          notes: input.notes,
          autoSendWithShipment: input.autoSendWithShipment,
          createdBy: ctx.user.id,
        });

        return { id: Number((result as any).insertId) };
      }),

    /** Update an existing COA */
    update: internalQualityProcedure
      .input(
        z.object({
          id: z.number(),
          status: z
            .enum(["draft", "pending_review", "approved", "rejected", "expired"])
            .optional(),
          documentUrl: z.string().optional(),
          notes: z.string().optional(),
          issueDate: z.string().optional(),
          expiryDate: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { id, issueDate, expiryDate, ...rest } = input;

        await db
          .update(certificatesOfAnalysis)
          .set({
            ...rest,
            issueDate: issueDate ? new Date(issueDate) : undefined,
            expiryDate: expiryDate ? new Date(expiryDate) : undefined,
          })
          .where(eq(certificatesOfAnalysis.id, id));

        return { success: true };
      }),
  }),

  // ----------------------------------------------------------
  // PRODUCT SPECIFICATIONS
  // ----------------------------------------------------------
  specs: router({
    /** List product specs — filter by status, productId */
    list: qualityProcedure
      .input(
        z.object({
          status: z
            .enum(["draft", "active", "superseded", "archived"])
            .optional(),
          productId: z.number().optional(),
          limit: z.number().min(1).max(500).default(200),
        }).optional()
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const conditions: ReturnType<typeof eq>[] = [];

        if (input?.status) {
          conditions.push(eq(productSpecifications.status, input.status));
        }
        if (input?.productId) {
          conditions.push(eq(productSpecifications.productId, input.productId));
        }

        const rows = await db
          .select({
            id: productSpecifications.id,
            productId: productSpecifications.productId,
            specNumber: productSpecifications.specNumber,
            specName: productSpecifications.specName,
            version: productSpecifications.version,
            status: productSpecifications.status,
            effectiveDate: productSpecifications.effectiveDate,
            expiryDate: productSpecifications.expiryDate,
            description: productSpecifications.description,
            ingredientDeclaration: productSpecifications.ingredientDeclaration,
            allergenStatement: productSpecifications.allergenStatement,
            allergens: productSpecifications.allergens,
            storageRequirements: productSpecifications.storageRequirements,
            shelfLifeDays: productSpecifications.shelfLifeDays,
            shelfLifeUnit: productSpecifications.shelfLifeUnit,
            packagingDescription: productSpecifications.packagingDescription,
            countryOfOrigin: productSpecifications.countryOfOrigin,
            documentUrl: productSpecifications.documentUrl,
            createdAt: productSpecifications.createdAt,
            // joined
            productName: products.name,
            productSku: products.sku,
          })
          .from(productSpecifications)
          .leftJoin(products, eq(productSpecifications.productId, products.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(products.name, desc(productSpecifications.createdAt))
          .limit(input?.limit ?? 200);

        return rows;
      }),

    /** Get a single spec including its parameters */
    get: qualityProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "NOT_FOUND" });

        const [spec] = await db
          .select()
          .from(productSpecifications)
          .where(eq(productSpecifications.id, input.id))
          .limit(1);

        if (!spec) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Spec not found" });
        }

        const params = await db
          .select()
          .from(specParameters)
          .where(eq(specParameters.specId, input.id))
          .orderBy(specParameters.sortOrder, specParameters.category);

        return { ...spec, parameters: params };
      }),

    /** Create a product specification (internal only) */
    create: internalQualityProcedure
      .input(
        z.object({
          productId: z.number(),
          specNumber: z.string().min(1),
          specName: z.string().min(1),
          version: z.string().default("1.0"),
          status: z.enum(["draft", "active", "superseded", "archived"]).default("draft"),
          effectiveDate: z.string().optional(),
          expiryDate: z.string().optional(),
          description: z.string().optional(),
          ingredientDeclaration: z.string().optional(),
          allergenStatement: z.string().optional(),
          allergens: z.array(z.string()).optional(),
          storageRequirements: z.string().optional(),
          shelfLifeDays: z.number().optional(),
          shelfLifeUnit: z.enum(["days", "weeks", "months", "years"]).optional(),
          packagingDescription: z.string().optional(),
          countryOfOrigin: z.string().optional(),
          documentUrl: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const result = await db.insert(productSpecifications).values({
          ...input,
          effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : undefined,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          createdBy: ctx.user.id,
        });

        return { id: Number((result as any).insertId) };
      }),

    /** Update a product specification */
    update: internalQualityProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["draft", "active", "superseded", "archived"]).optional(),
          version: z.string().optional(),
          documentUrl: z.string().optional(),
          allergens: z.array(z.string()).optional(),
          shelfLifeDays: z.number().optional(),
          shelfLifeUnit: z.enum(["days", "weeks", "months", "years"]).optional(),
          storageRequirements: z.string().optional(),
          description: z.string().optional(),
          effectiveDate: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { id, effectiveDate, ...rest } = input;

        await db
          .update(productSpecifications)
          .set({
            ...rest,
            effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
          })
          .where(eq(productSpecifications.id, id));

        return { success: true };
      }),
  }),

  // ----------------------------------------------------------
  // CUSTOMER SPECIFICATIONS
  // ----------------------------------------------------------
  customerSpecs: router({
    list: qualityProcedure
      .input(z.object({
        customerId: z.number().optional(),
        productId: z.number().optional(),
        status: z.enum(["draft", "pending_approval", "active", "superseded", "archived"]).optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const filters: any[] = [];
        if (input?.customerId) filters.push(eq(customerSpecifications.customerId, input.customerId));
        if (input?.productId) filters.push(eq(customerSpecifications.productId, input.productId));
        if (input?.status) filters.push(eq(customerSpecifications.status, input.status as any));
        return db.select().from(customerSpecifications)
          .where(filters.length ? and(...filters) : undefined)
          .orderBy(desc(customerSpecifications.createdAt))
          .limit(input?.limit ?? 50)
          .offset(input?.offset ?? 0);
      }),

    get: qualityProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const rows = await db.select().from(customerSpecifications).where(eq(customerSpecifications.id, input.id));
        if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
        return rows[0];
      }),

    create: qualityProcedure
      .input(z.object({
        customerId: z.number(),
        productId: z.number(),
        baseSpecId: z.number().optional(),
        specName: z.string(),
        customerSpecNumber: z.string().optional(),
        version: z.string().default("1.0"),
        customRequirements: z.string().optional(),
        customAllergenStatement: z.string().optional(),
        customLabelRequirements: z.string().optional(),
        overrides: z.any().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const result = await db.insert(customerSpecifications).values({
          ...input,
          createdBy: ctx.user.id,
        });
        return { id: Number(result[0].insertId), ...input };
      }),

    update: qualityProcedure
      .input(z.object({
        id: z.number(),
        specName: z.string().optional(),
        version: z.string().optional(),
        status: z.enum(["draft", "pending_approval", "active", "superseded", "archived"]).optional(),
        customRequirements: z.string().optional(),
        customAllergenStatement: z.string().optional(),
        customLabelRequirements: z.string().optional(),
        overrides: z.any().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        const { id, ...data } = input;
        await db.update(customerSpecifications).set(data as any).where(eq(customerSpecifications.id, id));
        return { success: true };
      }),

    delete: qualityProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await db.delete(customerSpecifications).where(eq(customerSpecifications.id, input.id));
        return { success: true };
      }),

    listByCustomer: qualityProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(customerSpecifications)
          .where(eq(customerSpecifications.customerId, input.customerId))
          .orderBy(desc(customerSpecifications.createdAt));
      }),

    listByProduct: qualityProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select().from(customerSpecifications)
          .where(eq(customerSpecifications.productId, input.productId))
          .orderBy(desc(customerSpecifications.createdAt));
      }),
  }),

  // ----------------------------------------------------------
  // NON-CONFORMANCE REPORTS (NCRs)
  // ----------------------------------------------------------
  ncrs: router({
    list: internalQualityProcedure
      .input(
        z.object({
          status: z
            .enum([
              "open",
              "investigating",
              "containment",
              "corrective_action",
              "verification",
              "closed",
            ])
            .optional(),
          productId: z.number().optional(),
          lotId: z.number().optional(),
          limit: z.number().min(1).max(500).default(100),
        }).optional()
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const conditions: ReturnType<typeof eq>[] = [];
        if (input?.status) conditions.push(eq(nonConformanceReports.status, input.status));
        if (input?.productId) conditions.push(eq(nonConformanceReports.productId, input.productId));
        if (input?.lotId) conditions.push(eq(nonConformanceReports.lotId, input.lotId));

        return db
          .select()
          .from(nonConformanceReports)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(nonConformanceReports.createdAt))
          .limit(input?.limit ?? 100);
      }),

    create: internalQualityProcedure
      .input(
        z.object({
          ncrNumber: z.string().min(1),
          title: z.string().min(1),
          description: z.string().optional(),
          type: z.enum([
            "incoming_material",
            "in_process",
            "finished_product",
            "customer_complaint",
            "audit_finding",
            "environmental",
            "equipment",
            "other",
          ]),
          severity: z.enum(["critical", "major", "minor", "observation"]),
          source: z.enum([
            "internal_audit",
            "external_audit",
            "customer_complaint",
            "supplier_issue",
            "process_deviation",
            "lab_result",
            "other",
          ]),
          detectedDate: z.string(),
          lotId: z.number().optional(),
          productId: z.number().optional(),
          vendorId: z.number().optional(),
          customerId: z.number().optional(),
          quantityAffected: z.number().optional(),
          quantityUnit: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const result = await db.insert(nonConformanceReports).values({
          ...input,
          detectedDate: new Date(input.detectedDate),
          status: "open",
          createdBy: ctx.user.id,
        });

        return { id: Number((result as any).insertId) };
      }),
  }),

  // ----------------------------------------------------------
  // CAPA ACTIONS
  // ----------------------------------------------------------
  capas: router({
    list: internalQualityProcedure
      .input(
        z.object({
          status: z
            .enum([
              "open",
              "root_cause_analysis",
              "action_planned",
              "in_progress",
              "verification",
              "closed",
              "closed_ineffective",
            ])
            .optional(),
          ncrId: z.number().optional(),
          limit: z.number().min(1).max(200).default(100),
        }).optional()
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const conditions: ReturnType<typeof eq>[] = [];
        if (input?.status) conditions.push(eq(capaActions.status, input.status));
        if (input?.ncrId) conditions.push(eq(capaActions.ncrId, input.ncrId));

        return db
          .select()
          .from(capaActions)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(capaActions.createdAt))
          .limit(input?.limit ?? 100);
      }),
  }),

  // ----------------------------------------------------------
  // LAB TESTING LOGS
  // ----------------------------------------------------------
  labTests: router({
    list: internalQualityProcedure
      .input(
        z.object({
          lotId: z.number().optional(),
          productId: z.number().optional(),
          status: z
            .enum(["pending", "in_progress", "completed", "failed", "cancelled"])
            .optional(),
          limit: z.number().min(1).max(500).default(100),
        }).optional()
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const conditions: ReturnType<typeof eq>[] = [];
        if (input?.lotId) conditions.push(eq(labTestingLogs.lotId, input.lotId));
        if (input?.productId) conditions.push(eq(labTestingLogs.productId, input.productId));
        if (input?.status) conditions.push(eq(labTestingLogs.status, input.status));

        return db
          .select()
          .from(labTestingLogs)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(labTestingLogs.createdAt))
          .limit(input?.limit ?? 100);
      }),
  }),

  // ----------------------------------------------------------
  // LOT TRACEABILITY
  // ----------------------------------------------------------
  traceability: router({
    /** Forward trace: given a source lot, find all finished product lots it went into */
    forwardTrace: internalQualityProcedure
      .input(z.object({ sourceLotId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        return db
          .select()
          .from(lotTraceabilityLinks)
          .where(eq(lotTraceabilityLinks.sourceLotId, input.sourceLotId))
          .orderBy(desc(lotTraceabilityLinks.linkDate));
      }),

    /** Backward trace: given a finished product lot, find all source lots used to make it */
    backwardTrace: internalQualityProcedure
      .input(z.object({ destinationLotId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        return db
          .select()
          .from(lotTraceabilityLinks)
          .where(eq(lotTraceabilityLinks.destinationLotId, input.destinationLotId))
          .orderBy(desc(lotTraceabilityLinks.linkDate));
      }),

    /** Shipment records — which customers received which lots */
    shipments: router({
      list: qualityProcedure
        .input(
          z.object({
            customerId: z.number().optional(),
            lotId: z.number().optional(),
            productId: z.number().optional(),
            limit: z.number().min(1).max(500).default(200),
          }).optional()
        )
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return [];

          const conditions: ReturnType<typeof eq>[] = [];
          if (input?.customerId) {
            conditions.push(eq(lotShipmentRecords.customerId, input.customerId));
          }
          if (input?.lotId) {
            conditions.push(eq(lotShipmentRecords.lotId, input.lotId));
          }
          if (input?.productId) {
            conditions.push(eq(lotShipmentRecords.productId, input.productId));
          }

          const rows = await db
            .select({
              id: lotShipmentRecords.id,
              lotId: lotShipmentRecords.lotId,
              orderId: lotShipmentRecords.orderId,
              shipmentId: lotShipmentRecords.shipmentId,
              customerId: lotShipmentRecords.customerId,
              productId: lotShipmentRecords.productId,
              quantityShipped: lotShipmentRecords.quantityShipped,
              quantityUnit: lotShipmentRecords.quantityUnit,
              shipDate: lotShipmentRecords.shipDate,
              deliveryDate: lotShipmentRecords.deliveryDate,
              coaId: lotShipmentRecords.coaId,
              notes: lotShipmentRecords.notes,
              createdAt: lotShipmentRecords.createdAt,
              // joined
              lotNumber: inventoryLots.lotNumber,
              productName: products.name,
              productSku: products.sku,
              coaDocumentUrl: certificatesOfAnalysis.documentUrl,
              coaNumber: certificatesOfAnalysis.coaNumber,
              coaStatus: certificatesOfAnalysis.status,
            })
            .from(lotShipmentRecords)
            .leftJoin(inventoryLots, eq(lotShipmentRecords.lotId, inventoryLots.id))
            .leftJoin(products, eq(lotShipmentRecords.productId, products.id))
            .leftJoin(
              certificatesOfAnalysis,
              eq(lotShipmentRecords.coaId, certificatesOfAnalysis.id)
            )
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(lotShipmentRecords.shipDate))
            .limit(input?.limit ?? 200);

          return rows;
        }),

      /** Record a new lot-to-customer shipment */
      create: internalQualityProcedure
        .input(
          z.object({
            lotId: z.number(),
            customerId: z.number(),
            productId: z.number(),
            quantityShipped: z.number().positive(),
            quantityUnit: z.string().optional(),
            orderId: z.number().optional(),
            shipmentId: z.number().optional(),
            coaId: z.number().optional(),
            shipDate: z.string().optional(),
            deliveryDate: z.string().optional(),
            notes: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

          const result = await db.insert(lotShipmentRecords).values({
            ...input,
            quantityShipped: String(input.quantityShipped),
            shipDate: input.shipDate ? new Date(input.shipDate) : undefined,
            deliveryDate: input.deliveryDate
              ? new Date(input.deliveryDate)
              : undefined,
          });

          return { id: Number((result as any).insertId) };
        }),
    }),
  }),

  // ----------------------------------------------------------
  // SHELF LIFE ALERTS
  // ----------------------------------------------------------
  shelfLife: router({
    alerts: router({
      list: internalQualityProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(shelfLifeAlerts)
          .orderBy(desc(shelfLifeAlerts.createdAt));
      }),

      stats: internalQualityProcedure.query(async () => {
        const db = await getDb();
        if (!db) return { total: 0, critical: 0, warning: 0, resolved: 0 };
        const rows = await db.select().from(shelfLifeAlerts);
        return {
          total: rows.length,
          critical: rows.filter((r: any) => r.severity === "critical").length,
          warning: rows.filter((r: any) => r.severity === "warning").length,
          resolved: rows.filter((r: any) => r.status === "resolved").length,
        };
      }),

      expiringSoon: internalQualityProcedure
        .input(z.object({ daysAhead: z.number().min(1).max(365).default(30) }))
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return [];
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() + input.daysAhead);
          // Return all unresolved alerts — client can further filter by expiryDate
          const rows = await db
            .select()
            .from(shelfLifeAlerts)
            .where(eq(shelfLifeAlerts.status, "active" as any))
            .orderBy(shelfLifeAlerts.createdAt);
          return rows;
        }),

      update: internalQualityProcedure
        .input(
          z.object({
            id: z.number(),
            status: z.enum(["active", "acknowledged", "resolved", "disposed"]),
            action: z
              .enum(["none", "discount_sale", "rework", "donate", "dispose", "return_to_vendor"])
              .optional(),
            actionNotes: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          const { id, ...rest } = input;
          await db
            .update(shelfLifeAlerts)
            .set(rest)
            .where(eq(shelfLifeAlerts.id, id));
          return { success: true };
        }),
    }),
  }),

  // ----------------------------------------------------------
  // PRICING (reused under qualityManagement namespace for
  // compatibility with existing Pricing.tsx imports)
  // ----------------------------------------------------------
  pricing: router({
    books: router({
      list: protectedProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(priceBooks)
          .orderBy(desc(priceBooks.createdAt));
      }),

      create: protectedProcedure
        .input(
          z.object({
            name: z.string().min(1),
            type: z.enum([
              "standard",
              "customer_specific",
              "volume_discount",
              "promotional",
              "market_based",
              "broker",
            ]),
            customerId: z.number().optional(),
            brokerId: z.number().optional(),
            status: z.enum(["draft", "active", "expired", "archived"]).default("draft"),
            effectiveDate: z.string().optional(),
            expiryDate: z.string().optional(),
            currency: z.string().default("USD"),
            description: z.string().optional(),
            notes: z.string().optional(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          const result = await db.insert(priceBooks).values({
            ...input,
            effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : undefined,
            expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
            createdBy: ctx.user.id,
          });
          return { id: Number((result as any).insertId) };
        }),
    }),

    entries: router({
      listByBook: protectedProcedure
        .input(z.object({ priceBookId: z.number() }))
        .query(async ({ input }) => {
          const db = await getDb();
          if (!db) return [];
          return db
            .select()
            .from(priceBookEntries)
            .where(eq(priceBookEntries.priceBookId, input.priceBookId))
            .orderBy(priceBookEntries.productId);
        }),

      create: protectedProcedure
        .input(
          z.object({
            priceBookId: z.number(),
            productId: z.number().optional(),
            rawMaterialId: z.number().optional(),
            unitPrice: z.number().positive(),
            unit: z.string().optional(),
            currency: z.string().default("USD"),
            minQuantity: z.number().optional(),
            maxQuantity: z.number().optional(),
            effectiveDate: z.string().optional(),
            expiryDate: z.string().optional(),
            notes: z.string().optional(),
          })
        )
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          const result = await db.insert(priceBookEntries).values({
            ...input,
            unitPrice: String(input.unitPrice),
            minQuantity: input.minQuantity ? String(input.minQuantity) : undefined,
            maxQuantity: input.maxQuantity ? String(input.maxQuantity) : undefined,
            effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : undefined,
            expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
            createdBy: ctx.user.id,
          });
          return { id: Number((result as any).insertId) };
        }),
    }),
  }),

  // ----------------------------------------------------------
  // COMMISSIONS (reused under qualityManagement namespace)
  // ----------------------------------------------------------
  commissions: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(brokerCommissions).orderBy(desc(brokerCommissions.createdAt));
    }),

    create: protectedProcedure
      .input(
        z.object({
          brokerId: z.number(),
          brokerName: z.string().min(1),
          commissionType: z.enum(["percentage", "flat_per_unit", "flat_per_order", "tiered"]),
          commissionRate: z.number(),
          productId: z.number().optional(),
          customerId: z.number().optional(),
          effectiveDate: z.string().optional(),
          expiryDate: z.string().optional(),
          paymentTerms: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const result = await db.insert(brokerCommissions).values({
          ...input,
          commissionRate: String(input.commissionRate),
          effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : undefined,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          createdBy: ctx.user.id,
        });
        return { id: Number((result as any).insertId) };
      }),

    transactions: router({
      list: protectedProcedure.query(async () => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(commissionTransactions)
          .orderBy(desc(commissionTransactions.createdAt));
      }),

      create: protectedProcedure
        .input(
          z.object({
            brokerCommissionId: z.number(),
            orderId: z.number().optional(),
            invoiceId: z.number().optional(),
            commissionAmount: z.number(),
            orderAmount: z.number().optional(),
            status: z
              .enum(["pending", "approved", "paid", "disputed", "cancelled"])
              .default("pending"),
            periodStart: z.string().optional(),
            periodEnd: z.string().optional(),
            notes: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          const result = await db.insert(commissionTransactions).values({
            ...input,
            commissionAmount: String(input.commissionAmount),
            orderAmount: input.orderAmount ? String(input.orderAmount) : undefined,
            periodStart: input.periodStart ? new Date(input.periodStart) : undefined,
            periodEnd: input.periodEnd ? new Date(input.periodEnd) : undefined,
          });
          return { id: Number((result as any).insertId) };
        }),
    }),
  }),

  // ----------------------------------------------------------
  // DEDUCTIONS (reused under qualityManagement namespace)
  // ----------------------------------------------------------
  deductions: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(customerDeductions)
        .orderBy(desc(customerDeductions.createdAt));
    }),

    stats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, open: 0, resolved: 0, totalAmount: 0 };
      const rows = await db.select().from(customerDeductions);
      const totalAmount = rows.reduce(
        (sum: number, r: any) => sum + parseFloat(r.claimAmount ?? "0"),
        0
      );
      return {
        total: rows.length,
        open: rows.filter((r: any) => r.status === "open").length,
        resolved: rows.filter(
          (r: any) => r.status === "credited" || r.status === "written_off"
        ).length,
        totalAmount,
      };
    }),

    create: protectedProcedure
      .input(
        z.object({
          customerId: z.number(),
          deductionNumber: z.string().min(1),
          type: z.enum([
            "shortage",
            "quality_claim",
            "pricing_discrepancy",
            "damage",
            "late_delivery",
            "unauthorized_deduction",
            "promotion",
            "freight_claim",
            "other",
          ]),
          claimAmount: z.number(),
          invoiceId: z.number().optional(),
          orderId: z.number().optional(),
          lotId: z.number().optional(),
          productId: z.number().optional(),
          description: z.string().optional(),
          customerReference: z.string().optional(),
          claimDate: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const result = await db.insert(customerDeductions).values({
          ...input,
          claimAmount: String(input.claimAmount),
          claimDate: new Date(input.claimDate),
          status: "open",
          createdBy: ctx.user.id,
        });
        return { id: Number((result as any).insertId) };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z
            .enum([
              "open",
              "investigating",
              "approved",
              "partially_approved",
              "denied",
              "credited",
              "written_off",
            ])
            .optional(),
          resolution: z.string().optional(),
          approvedAmount: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, approvedAmount, ...rest } = input;
        await db
          .update(customerDeductions)
          .set({
            ...rest,
            approvedAmount: approvedAmount != null ? String(approvedAmount) : undefined,
          })
          .where(eq(customerDeductions.id, id));
        return { success: true };
      }),
  }),
});

export type QualityManagementRouter = typeof qualityManagementRouter;
