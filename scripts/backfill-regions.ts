/**
 * Multi-region Phase 1 backfill. Run ONCE after `pnpm db:push`:
 *
 *   tsx scripts/backfill-regions.ts
 *
 * Backfill-safe: `users.regionScope` defaults to "global" in the schema, so every existing user
 * keeps full visibility even before this runs. This script just sets up the default region +
 * entity and gives existing records a home entity so scoped queries have something to match.
 * See docs/MULTI_REGION_PHASE_1_2_SPEC.md §2.4.
 */
import "dotenv/config";
import { asc, eq, isNull } from "drizzle-orm";
import { getDb } from "../server/db";
import { regions, companies, users, customers } from "../drizzle/schema";

const DEFAULT_REGION_CODE = "HQ";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL not set — cannot run backfill");

  // 1. Ensure a default region, selected by its stable natural key (idempotent across re-runs).
  let region = (await db.select().from(regions).where(eq(regions.code, DEFAULT_REGION_CODE)).limit(1))[0];
  if (!region) {
    await db.insert(regions).values({ code: DEFAULT_REGION_CODE, name: "Headquarters", baseCurrency: "USD" });
    region = (await db.select().from(regions).where(eq(regions.code, DEFAULT_REGION_CODE)).limit(1))[0];
    console.log(`Created default region "${region.code}" (#${region.id}).`);
  }

  // 2. Ensure a default company (legal entity) assigned to that region. Pick deterministically
  //    (lowest id) so a re-run never selects a different existing entity.
  let company = (await db.select().from(companies).orderBy(asc(companies.id)).limit(1))[0];
  if (!company) {
    await db.insert(companies).values({ name: "Default Entity", regionId: region.id });
    company = (await db.select().from(companies).orderBy(asc(companies.id)).limit(1))[0];
    console.log(`Created default company "${company.name}" (#${company.id}).`);
  } else if (company.regionId == null) {
    await db.update(companies).set({ regionId: region.id }).where(eq(companies.id, company.id));
    console.log(`Assigned company #${company.id} to region #${region.id}.`);
  }

  // 3. Give every user a home entity. regionScope stays "global" (schema default), so visibility
  //    is unchanged until entities are explicitly assigned and scopes are tightened.
  await db.update(users).set({ companyId: company.id }).where(isNull(users.companyId));
  console.log("Assigned a home entity to users without one.");

  // 4. Backfill companyId on customers so region-scoped queries have a home entity to match.
  await db.update(customers).set({ companyId: company.id }).where(isNull(customers.companyId));
  console.log("Backfilled companyId on customers without one.");

  console.log("Multi-region backfill complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
