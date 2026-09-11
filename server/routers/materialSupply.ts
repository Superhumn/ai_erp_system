// appRouter.materialSupply — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { router } from "../_core/trpc";
import * as db from "../db";
import { opsProcedure } from "./_shared";

// Material Supply & Reorder — inventory + inbound freight + reorder recommendations.
// No caller-supplied companyId: the param would let any ops user scope to an
// arbitrary tenant, and there is no per-user company to validate it against.
export const materialSupplyRouter = router({
    overview: opsProcedure.query(() => db.getMaterialSupplyOverview()),
  });
