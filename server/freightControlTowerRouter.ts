import { protectedProcedure, router } from "./_core/trpc";
import { freightSnapshot } from "@shared/freight-control-tower/fixtures";

/**
 * Freight Control Tower — the single read the board hydrates from.
 *
 * In production every field of this snapshot comes from a real system (ERP
 * purchasing + freight EDI for movements, inventory balances by plant with
 * quarantined lots excluded for cover, MES for WIP, the vendor master, the
 * document-management/customs-broker feed, and the carrier tracking API). Here
 * it returns the demo fixtures verbatim; swap the body for those integrations
 * and the client is unchanged. The coverage projection is derived from this one
 * source (see shared/freight-control-tower/projection.ts) so every view agrees.
 */
export const freightControlTowerRouter = router({
  snapshot: protectedProcedure.query(() => freightSnapshot()),
});
