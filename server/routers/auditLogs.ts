// appRouter.auditLogs — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { router } from "../_core/trpc";
import * as db from "../db";
import { adminProcedure } from "./_shared";

// ============================================
// AUDIT LOGS
// ============================================
export const auditLogsRouter = router({
    list: adminProcedure
      .input(z.object({
        companyId: z.number().optional(),
        entityType: z.string().optional(),
        entityId: z.number().optional(),
        userId: z.number().optional(),
      }).optional())
      .query(({ input }) => db.getAuditLogs(input)),
  });
