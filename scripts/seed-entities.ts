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
import { eq } from "drizzle-orm";
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
  console.log(`Created entity ${seed.code} (#${created.id}).`);
  return created.id;
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL not set — cannot seed entities");

  const globalSeed = ENTITIES.find((e) => e.code === "GLOBAL")!;
  const globalId = await upsert(db, globalSeed, null);

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
