/**
 * Multi-entity rollout — STEP 1 seed. Idempotent (upserts by `code`). Run after `pnpm db:push`
 * and applying drizzle/manual/step1_entity_tree.sql:
 *
 *   tsx scripts/seed-entities.ts
 *
 * Seeds the holding company (GLOBAL) and the regional operating companies as its children.
 * `companies` IS the entity table (see docs / STEP 1).
 */
import "dotenv/config";
import { asc, eq, isNull } from "drizzle-orm";
import { getDb } from "../server/db";
import { companies } from "../drizzle/schema";

type Seed = {
  code: string;
  name: string;
  entityType: "holdco" | "opco" | "jv";
  functionalCurrency: string;
  countryCode?: string;
  ownershipPctOfParent?: string;
  parentCode?: string;
};

const ENTITIES: Seed[] = [
  { code: "GLOBAL", name: "Global (Holding Co.)", entityType: "holdco", functionalCurrency: "USD" },
  { code: "SA",   name: "Saudi Arabia",  entityType: "opco", functionalCurrency: "SAR", countryCode: "SA", ownershipPctOfParent: "100.0000", parentCode: "GLOBAL" },
  { code: "US",   name: "United States", entityType: "opco", functionalCurrency: "USD", countryCode: "US", ownershipPctOfParent: "100.0000", parentCode: "GLOBAL" },
  { code: "ASIA", name: "Asia",          entityType: "opco", functionalCurrency: "SGD", ownershipPctOfParent: "100.0000", parentCode: "GLOBAL" },
  { code: "CO",   name: "Colombia",      entityType: "opco", functionalCurrency: "COP", countryCode: "CO", ownershipPctOfParent: "100.0000", parentCode: "GLOBAL" },
  { code: "IN",   name: "India",         entityType: "opco", functionalCurrency: "INR", countryCode: "IN", ownershipPctOfParent: "100.0000", parentCode: "GLOBAL" },
];

async function upsert(db: any, seed: Seed, parentId: number | null): Promise<number> {
  const values = {
    code: seed.code,
    name: seed.name,
    entityType: seed.entityType,
    type: seed.entityType === "holdco" ? ("parent" as const) : ("subsidiary" as const),
    functionalCurrency: seed.functionalCurrency,
    countryCode: seed.countryCode ?? null,
    ownershipPctOfParent: seed.ownershipPctOfParent ?? null,
    parentCompanyId: parentId,
  };
  const existing = (await db.select().from(companies).where(eq(companies.code, seed.code)).limit(1))[0];
  if (existing) {
    await db.update(companies).set(values).where(eq(companies.id, existing.id));
    console.log(`Updated entity ${seed.code} (#${existing.id}).`);
    return existing.id;
  }
  await db.insert(companies).values(values);
  const created = (await db.select().from(companies).where(eq(companies.code, seed.code)).limit(1))[0];
  if (!created) {
    throw new Error(`Failed to reload seeded entity "${seed.code}" after insert — the insert may not have committed.`);
  }
  console.log(`Created entity ${seed.code} (#${created.id}).`);
  return created.id;
}

// Adopt the pre-existing single company as the US entity, so existing company-scoped data and the
// tables STEP 2 backfills to US share ONE id (rather than splitting across a legacy id and a new
// US id). A "legacy" company is one that isn't one of our seeded codes (typically code = NULL).
// Runs before the US upsert; the upsert then finds code='US' and fills in its attributes.
async function adoptLegacyAsUsIfNeeded(db: any): Promise<void> {
  const existingUs = (await db.select().from(companies).where(eq(companies.code, "US")).limit(1))[0];
  if (existingUs) return; // US already exists — nothing to adopt

  // A legacy single-company row has no code (GLOBAL was just seeded with code='GLOBAL').
  const codeless = await db.select().from(companies).where(isNull(companies.code)).orderBy(asc(companies.id));

  if (codeless.length === 0) return; // fresh install — US will be created by the upsert
  if (codeless.length > 1) {
    throw new Error(
      `Cannot infer the US entity: ${codeless.length} companies have no code (ids: ` +
        `${codeless.map((c: any) => c.id).join(", ")}). Set companies.code = 'US' on the correct ` +
        `existing company manually, then re-run this seed.`,
    );
  }
  await db.update(companies).set({ code: "US" }).where(eq(companies.id, codeless[0].id));
  console.log(`Adopted existing company #${codeless[0].id} as the US entity (id preserved).`);
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL not set — cannot seed entities");

  const globalSeed = ENTITIES.find((e) => e.code === "GLOBAL")!;
  const globalId = await upsert(db, globalSeed, null);

  // Convert the existing single company into US (id-preserving) before seeding the opcos.
  await adoptLegacyAsUsIfNeeded(db);

  for (const e of ENTITIES.filter((e) => e.parentCode === "GLOBAL")) {
    await upsert(db, e, globalId);
  }

  console.log("Entity seed complete. GLOBAL id =", globalId);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
