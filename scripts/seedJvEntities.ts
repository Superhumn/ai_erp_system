import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, asc } from "drizzle-orm";
import { companies } from "../drizzle/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

const JV_ROWS: Array<{ name: string; country: string; legalName?: string }> = [
  { name: "Superhumn SA JV", country: "South Africa", legalName: "Superhumn SA (Pty) Ltd" },
  { name: "Superhumn Asia JV", country: "Singapore", legalName: "Superhumn Asia Pte. Ltd." },
  { name: "Superhumn India JV", country: "India", legalName: "Superhumn India Pvt. Ltd." },
];

async function main() {
  const parents = await db
    .select()
    .from(companies)
    .where(eq(companies.type, "parent"))
    .orderBy(asc(companies.id));

  const parent = parents.find((c) => /superhumn/i.test(c.name)) ?? parents[0];
  if (!parent) {
    console.error("No parent company found. Create the Superhumn parent first.");
    process.exit(1);
  }
  console.log(`Using parent: [${parent.id}] ${parent.name}`);

  for (const jv of JV_ROWS) {
    const existing = await db
      .select()
      .from(companies)
      .where(and(eq(companies.name, jv.name), eq(companies.parentCompanyId, parent.id)));
    if (existing.length > 0) {
      console.log(`  - ${jv.name}: already exists (id=${existing[0].id})`);
      continue;
    }
    const result = await db.insert(companies).values({
      name: jv.name,
      legalName: jv.legalName,
      type: "subsidiary",
      parentCompanyId: parent.id,
      country: jv.country,
      status: "active",
    });
    console.log(`  + ${jv.name}: created (id=${result[0].insertId})`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
