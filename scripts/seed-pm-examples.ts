/**
 * Seed example PM data so the matrix renders something on first load.
 * Idempotent: skips any program/project whose name already exists.
 *
 * Markets and functions are seeded by migration 0044. This script adds:
 *   - one example program per Tier 1 market (ZA, IN, US)
 *   - three sample projects per program, spread across functions
 *
 * Usage: tsx scripts/seed-pm-examples.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { pmMarkets, pmFunctions, pmPrograms, pmProjects } from "../drizzle/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const SAMPLES: Record<string, { program: string; projects: Array<{ name: string; functionCode: string; status?: string; priority?: string; cashEventAmount?: string; cashEventType?: string; cashEventMonthsOut?: number }> }> = {
  ZA: {
    program: "South Africa market entry",
    projects: [
      { name: "FactoryCo Pty Ltd SHA finalization", functionCode: "LEGAL", status: "in_progress", priority: "p0" },
      { name: "ZA Tier-1 retailer pitch deck", functionCode: "SALES", status: "in_progress", priority: "p1", cashEventAmount: "250000", cashEventType: "revenue", cashEventMonthsOut: 3 },
      { name: "Cape Town copacker SOP rollout", functionCode: "MFG", status: "not_started", priority: "p1" },
    ],
  },
  IN: {
    program: "India launch",
    projects: [
      { name: "FSSAI license — Mumbai facility", functionCode: "LEGAL", status: "blocked", priority: "p0" },
      { name: "Mumbai retailer demand validation", functionCode: "SALES", status: "in_progress", priority: "p1" },
      { name: "INR transfer pricing memo", functionCode: "FIN", status: "not_started", priority: "p2", cashEventAmount: "50000", cashEventType: "opex", cashEventMonthsOut: 2 },
    ],
  },
  US: {
    program: "US growth (existing market)",
    projects: [
      { name: "Q3 brand refresh — packaging", functionCode: "BRAND", status: "in_progress", priority: "p1" },
      { name: "Whole Foods northeast rollout", functionCode: "SALES", status: "in_progress", priority: "p0", cashEventAmount: "850000", cashEventType: "revenue", cashEventMonthsOut: 4 },
      { name: "Texas copacker capacity expansion", functionCode: "MFG", status: "not_started", priority: "p2", cashEventAmount: "300000", cashEventType: "capex", cashEventMonthsOut: 6 },
    ],
  },
};

async function main() {
  const pool = mysql.createPool(url!);
  const db = drizzle(pool);

  try {
    const markets = await db.select().from(pmMarkets);
    const functions = await db.select().from(pmFunctions);
    const fMap = new Map(functions.map(f => [f.code, f]));

    for (const market of markets) {
      const sample = SAMPLES[market.code];
      if (!sample) {
        console.log(`[skip] no sample for market ${market.code}`);
        continue;
      }

      const existingProgs = await db.select().from(pmPrograms)
        .where(eq(pmPrograms.name, sample.program)).limit(1);
      let programId: number;
      if (existingProgs.length > 0) {
        programId = existingProgs[0].id;
        console.log(`[exists] program "${sample.program}" id=${programId}`);
      } else {
        const start = new Date();
        const end = new Date();
        end.setMonth(end.getMonth() + 9);
        const insert = await db.insert(pmPrograms).values({
          name: sample.program,
          marketId: market.id,
          description: `Auto-seeded example program for ${market.name}.`,
          status: "in_progress",
          startDate: start,
          targetEndDate: end,
        });
        programId = insert[0].insertId;
        console.log(`[create] program "${sample.program}" id=${programId}`);
      }

      for (const proj of sample.projects) {
        const fn = fMap.get(proj.functionCode);
        if (!fn) {
          console.warn(`[skip] function ${proj.functionCode} not found`);
          continue;
        }
        const existingProj = await db.select().from(pmProjects)
          .where(eq(pmProjects.name, proj.name)).limit(1);
        if (existingProj.length > 0) {
          console.log(`  [exists] project "${proj.name}"`);
          continue;
        }
        const start = new Date();
        const target = new Date();
        target.setMonth(target.getMonth() + 6);
        let cashEventDate: Date | undefined;
        if (proj.cashEventMonthsOut) {
          cashEventDate = new Date();
          cashEventDate.setMonth(cashEventDate.getMonth() + proj.cashEventMonthsOut);
        }
        await db.insert(pmProjects).values({
          programId,
          marketId: market.id,
          functionId: fn.id,
          name: proj.name,
          status: (proj.status as any) ?? "not_started",
          priority: (proj.priority as any) ?? "p2",
          startDate: start,
          targetEndDate: target,
          blockerReason: proj.status === "blocked" ? "Awaiting upstream regulatory approval." : null,
          blockedSince: proj.status === "blocked" ? new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) : null,
          cashEventAmount: proj.cashEventAmount ?? null,
          cashEventType: (proj.cashEventType as any) ?? null,
          cashEventDate: cashEventDate ?? null,
        });
        console.log(`  [create] project "${proj.name}"`);
      }
    }
    console.log("\nSeed complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
