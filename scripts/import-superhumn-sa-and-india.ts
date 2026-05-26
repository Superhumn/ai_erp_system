/**
 * Import the SA Price List (foodservice + retail) and the India Launch Tracker
 * into the ERP.
 *
 * Sources:
 *   - Superhumn_SA_Price_List_May_2026.docx
 *   - Superhumn_India_Launch_Tracker_1.xlsx
 *
 * Populates:
 *   - products (SA SKUs, parent products)
 *   - product_regional_skus (the -SA suffix variants)
 *   - product_price_tiers + product_volume_discounts (foodservice + retail + MSRP)
 *   - projects + project_tasks (India Launch)
 *   - government_tenders (GeM, IRCTC, ICDS, CSD, AIIMS, state nutrition)
 *   - regulatory_licenses (FSSAI Central, DPIIT, EFSA Novel Food, PMKSY, etc.)
 *   - subsidiary_fundraising_rounds (India JV $2m raise)
 *   - brand_ambassadors (shortlist from tracker)
 *   - crm_contacts (Glokal, PickQwik)
 *
 * Idempotent: each section checks for an existing row before inserting.
 *
 * Usage:
 *   pnpm db:push          # apply the new schema first
 *   tsx scripts/import-superhumn-sa-and-india.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import {
  products,
  productRegionalSkus,
  productPriceTiers,
  productVolumeDiscounts,
  projects,
  projectTasks,
  governmentTenders,
  regulatoryLicenses,
  subsidiaryFundraisingRounds,
  brandAmbassadors,
  crmContacts,
  companies,
} from "../drizzle/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const EFFECTIVE_FROM = new Date("2026-05-01T00:00:00Z");

// ============================================
// SOURCE DATA — SA PRICE LIST
// ============================================

type SaProductRow = {
  parentSku: string;          // e.g. "SH-BWS-001"
  regionalSku: string;        // e.g. "SH-BWS-001-SA"
  name: string;
  category: string;
  // Foodservice
  foodservicePackSize: string;
  foodserviceBasePrice: number; // R/kg excl VAT
  // Retail
  retailPackSize: string;
  retailWholesale: number;     // R/kg excl VAT
  retailMsrp: number;          // R/kg
};

const SA_PRODUCTS: SaProductRow[] = [
  { parentSku: "SH-CGB-001",   regionalSku: "SH-CGB-001",      name: "Ground Beef — Cooked",     category: "Ground Beef",            foodservicePackSize: "2 kg / 5 kg", foodserviceBasePrice: 128, retailPackSize: "500 g", retailWholesale: 95,  retailMsrp: 152 },
  { parentSku: "SH-CBS-001",   regionalSku: "SH-CBS-001",      name: "Beef Slices — Cooked",     category: "Beef Slices & Jerky",    foodservicePackSize: "1 kg / 2.5 kg", foodserviceBasePrice: 190, retailPackSize: "500 g", retailWholesale: 165, retailMsrp: 266 },
  { parentSku: "SH-CMCB-001",  regionalSku: "SH-CMCB-001-SA",  name: "Cape Malay Curry Beef",    category: "Seasoned Beef — SA",     foodservicePackSize: "2 kg / 5 kg", foodserviceBasePrice: 140, retailPackSize: "500 g", retailWholesale: 165, retailMsrp: 266 },
  { parentSku: "SH-PPB-001",   regionalSku: "SH-PPB-001-SA",   name: "Peri-Peri Beef",           category: "Seasoned Beef — SA",     foodservicePackSize: "2 kg / 5 kg", foodserviceBasePrice: 140, retailPackSize: "500 g", retailWholesale: 165, retailMsrp: 266 },
  { parentSku: "SH-BSB-001",   regionalSku: "SH-BSB-001-SA",   name: "Boerewors Spice Beef",     category: "Seasoned Beef — SA",     foodservicePackSize: "2 kg / 5 kg", foodserviceBasePrice: 140, retailPackSize: "500 g", retailWholesale: 165, retailMsrp: 266 },
  { parentSku: "SH-BB-001",    regionalSku: "SH-BB-001",       name: "Beef Burgers",             category: "Formed & Processed",     foodservicePackSize: "1 kg / 2.5 kg", foodserviceBasePrice: 145, retailPackSize: "400 g", retailWholesale: 118, retailMsrp: 190 },
  { parentSku: "SH-MB-001",    regionalSku: "SH-MB-001",       name: "Meatballs",                category: "Formed & Processed",     foodservicePackSize: "1 kg / 2.5 kg", foodserviceBasePrice: 145, retailPackSize: "400 g", retailWholesale: 118, retailMsrp: 190 },
  { parentSku: "SH-BWS-001",   regionalSku: "SH-BWS-001-SA",   name: "Boerewors Sausage",        category: "Sausage",                foodservicePackSize: "1 kg / 2.5 kg", foodserviceBasePrice: 125, retailPackSize: "500 g", retailWholesale: 95,  retailMsrp: 152 },
  { parentSku: "SH-BKS-001",   regionalSku: "SH-BKS-001-SA",   name: "Breakfast Sausage",        category: "Sausage",                foodservicePackSize: "1 kg / 2.5 kg", foodserviceBasePrice: 125, retailPackSize: "500 g", retailWholesale: 95,  retailMsrp: 152 },
];

// Retail-only extra
const SA_RETAIL_ONLY: { parentSku: string; regionalSku: string; name: string; category: string; retailPackSize: string; retailWholesale: number; retailMsrp: number }[] = [
  { parentSku: "SH-DBS-001", regionalSku: "SH-DBS-001", name: "Beef Jerky", category: "Beef Slices & Jerky", retailPackSize: "250 g", retailWholesale: 295, retailMsrp: 475 },
];

// Volume discount bands (apply to both foodservice and retail wholesale)
const SA_VOLUME_BANDS = [
  { minQty: "25",   maxQty: "99",   discountPercent: "0",  notes: "25-99 kg: base price" },
  { minQty: "100",  maxQty: "249",  discountPercent: "5",  notes: "100-249 kg: -5%" },
  { minQty: "250",  maxQty: "499",  discountPercent: "10", notes: "250-499 kg: -10%" },
  { minQty: "500",  maxQty: undefined, discountPercent: "15", notes: "500 kg +: -15%" },
];

// ============================================
// SOURCE DATA — INDIA LAUNCH TRACKER
// ============================================

const INDIA_PROJECT_NAME = "Superhumn India Launch";

const INDIA_TASKS: { phase: string; name: string; category: string; status: string; notes?: string; ownerInitials?: string }[] = [
  // LEGAL / CORP
  { phase: "NOW-M3",  name: "Incorporate India JV entity",          category: "Legal/Corp",     status: "not_started", notes: "49% Superhumn / 51% India partner and investor owned" },
  // FUNDS / GRANTS
  { phase: "NOW-M3",  name: "Raise $2m from local India partners",  category: "Funds",          status: "in_progress" },
  { phase: "NOW-M3",  name: "Apply for manufacturing facility and equipment loans", category: "Funds", status: "not_started" },
  // PRODUCTION
  { phase: "NOW-M3",  name: "Find co-packer (Mumbai or Pune)",      category: "Manufacturing",  status: "not_started", notes: "Must hold FSSAI Central License. Aseptic Tetra Pak required" },
  { phase: "NOW-M3",  name: "Obtain India SKU EAN-13 barcodes (890 prefix)", category: "Product", status: "not_started", notes: "23 SKUs across 3 phases. Registered with GS1 India" },
  { phase: "NOW-M3",  name: "Source domestic coconut cream and cashew supplier", category: "Supply Chain", status: "not_started", ownerInitials: "JC", notes: "Maharashtra or MP. Lock contract pricing" },
  { phase: "NOW-M2",  name: "Send trial ingredients to co-packer",  category: "Manufacturing",  status: "not_started", ownerInitials: "JC" },
  { phase: "NOW",     name: "Find aseptic Tetra Pak packaging supplier", category: "Manufacturing", status: "not_started", ownerInitials: "JC", notes: "200ml, 500ml, 1L. Tetra Pak India or SIG Combibloc" },
  { phase: "NOW-M3",  name: "Co-packer trial production run",       category: "Manufacturing",  status: "not_started", notes: "Full trial batch of Phase 1 dairy SKUs. Document yield, texture, shelf stability" },
  { phase: "M2-M4",   name: "Set up India distributor / logistics partner", category: "Supply Chain", status: "not_started", notes: "Ambient warehouse sufficient for Phase 1" },
  { phase: "M4-M9",   name: "Europe import compliance",             category: "Supply Chain",   status: "not_started", notes: "EU Novel Food Reg 2015/2283, EFSA, FIC 1169/2011, HS codes, TRACES NT" },
  { phase: "M10-M18", name: "Begin Phase 2 meat SKU production",    category: "Manufacturing",  status: "not_started", notes: "6 SKUs. Retort pouch. 365-day shelf life" },
  // SALES / MARKETING
  { phase: "NOW-M3",  name: "Identify Indian celebrity for Superhumn animated series", category: "Marketing", status: "not_started", notes: "Candidates: Virat Kohli, Neeraj Chopra, Ranveer Singh" },
  { phase: "NOW-M3",  name: "Press campaigns",                      category: "Marketing",      status: "not_started" },
  { phase: "M4-M9",   name: "Host client tastings (Taj, ITC, Marriott, Hyatt)", category: "Sales", status: "not_started" },
  { phase: "M4-M9",   name: "Target 3 anchor account LOIs",         category: "Sales",          status: "not_started" },
  { phase: "M10-M18", name: "20 hotel/restaurant accounts live",    category: "Sales",          status: "not_started" },
  { phase: "M31-M36", name: "GCC / Europe export from India facility", category: "Sales",       status: "not_started", ownerInitials: "OP", notes: "India as regional manufacturing hub" },
  { phase: "M19-M30", name: "6 RTE meat SKUs live",                 category: "Sales",          status: "not_started", notes: "Butter Chicken, Dal Makhani, Palak Paneer, Chana Masala, Rajma, Biryani" },
  { phase: "M31-M36", name: "Retail launch",                        category: "Sales",          status: "not_started" },
  { phase: "M31-M36", name: "600+ accounts live target",            category: "Sales",          status: "not_started" },
  // E-COMMERCE
  { phase: "M10-M18", name: "Brand.com D2C store live",             category: "E-Commerce",     status: "not_started" },
  { phase: "M10-M18", name: "BigBasket + Blinkit listed",           category: "E-Commerce",     status: "not_started" },
  { phase: "M10-M18", name: "Zepto + Swiggy Instamart listing",     category: "E-Commerce",     status: "not_started", notes: "10-min delivery. Urban premium" },
  // OWN MANUFACTURING
  { phase: "M19-M30", name: "Begin Phase 3 frozen protein development", category: "Manufacturing", status: "not_started", notes: "Mutton Keema, Rogan Josh, Seekh Kebab, Kofta" },
  { phase: "M19-M30", name: "Own facility — site selection",        category: "Manufacturing",  status: "not_started", notes: "Maharashtra or Karnataka" },
  { phase: "M19-M30", name: "Own facility — architects + build tender", category: "Manufacturing", status: "not_started" },
  { phase: "M31-M36", name: "Phase 3 frozen protein — full launch (4 SKUs)", category: "Manufacturing", status: "not_started" },
  { phase: "M31-M36", name: "Own manufacturing facility operational", category: "Manufacturing", status: "not_started" },
];

const INDIA_TENDERS: {
  title: string;
  portal: any;
  category: any;
  agency?: string;
  state?: string;
  status: any;
  notes?: string;
  classILocalSupplier?: boolean;
  fssaiRequired?: boolean;
}[] = [
  { title: "GeM Portal — Class I Local Supplier registration", portal: "gem", category: "food_supply", status: "preparing", classILocalSupplier: true, notes: "Day-one of incorporation. Class I status unlocks procurement preference" },
  { title: "IRCTC catering tender — Phase 1 file",             portal: "irctc", category: "railway_catering", agency: "Indian Railways", status: "preparing", fssaiRequired: true, notes: "500M+ meals/year. 200ml individual milk and paneer ideal for tray service" },
  { title: "ICDS midday meal scheme — Maharashtra",            portal: "icds", category: "midday_meal", state: "Maharashtra", status: "preparing", notes: "State-by-state filing" },
  { title: "ICDS midday meal scheme — Karnataka",              portal: "icds", category: "midday_meal", state: "Karnataka",   status: "preparing", notes: "State-by-state filing" },
  { title: "IRCTC tender response submission",                 portal: "irctc", category: "railway_catering", status: "watching" },
  { title: "CSD defense canteen — initial outreach",           portal: "csd", category: "defense_canteen", agency: "Canteen Stores Department", status: "watching", notes: "Pan-India distribution network" },
  { title: "AIIMS + government hospital procurement outreach", portal: "aiims", category: "hospital_procurement", status: "watching" },
  { title: "State nutrition program tenders",                  portal: "state_nutrition", category: "school_nutrition", status: "watching" },
  { title: "CSD defense canteen — onboarding",                 portal: "csd", category: "defense_canteen", status: "watching" },
];

const INDIA_LICENSES: {
  licenseType: any;
  country: string;
  state?: string;
  authority?: string;
  status: any;
  notes?: string;
}[] = [
  { licenseType: "fssai_central",         country: "IN",                                                      authority: "FSSAI",  status: "planned",  notes: "60-90 day processing. Use co-packer license for Phase 1" },
  { licenseType: "dpiit_startup_india",   country: "IN",                                                      authority: "DPIIT",  status: "planned",  notes: "Zero cost. Activates 3-year tax holiday from day one" },
  { licenseType: "pmksy_grant",           country: "IN",                                                      authority: "Ministry of Food Processing Industries", status: "planned", notes: "Up to 35% capex grant for food processing units. Material at Phase 3 facility build" },
  { licenseType: "maharashtra_agro_grant", country: "IN", state: "Maharashtra",                                authority: "Govt. of Maharashtra", status: "planned", notes: "25% capex subsidy up to INR 5Cr for food processing units" },
  { licenseType: "karnataka_udyog_mitra", country: "IN", state: "Karnataka",                                  authority: "Karnataka Udyog Mitra", status: "planned", notes: "Interest subvention + capex grant for food processing startups" },
  { licenseType: "efsa_novel_food",       country: "EU",                                                      authority: "EFSA", status: "planned", notes: "EU Novel Food Reg 2015/2283 (for India -> EU export)" },
  { licenseType: "fic_1169_2011_label",   country: "EU",                                                      authority: "European Commission", status: "planned", notes: "FIC 1169/2011 labelling for EU export" },
  { licenseType: "traces_nt",             country: "EU",                                                      authority: "DG SANTE", status: "planned", notes: "TRACES NT registration for India -> EU food imports" },
  { licenseType: "iec_import_export",     country: "IN",                                                      authority: "DGFT", status: "planned", notes: "Required to export from India facility (Phase 4 GCC/EU)" },
];

const AMBASSADOR_SHORTLIST: { name: string; type: any; category: string; country: string; notes: string; followerCount?: number }[] = [
  { name: "Virat Kohli",   type: "athlete",   category: "cricket",  country: "IN", notes: "260M+ Instagram. Top shortlist candidate for Superhumn animated series character", followerCount: 260_000_000 },
  { name: "Neeraj Chopra", type: "athlete",   category: "olympic",  country: "IN", notes: "Olympic gold. Clean hero image. Strong fit for Superhumn animated series." },
  { name: "Ranveer Singh", type: "celebrity", category: "bollywood",country: "IN", notes: "Bollywood. High energy. Strong fit for Superhumn Scripts animated universe." },
];

const CRM_SEED: { company: string; contact?: string; notes?: string }[] = [
  { company: "Glokal", contact: "Santhosh Katkurwar", notes: "Small restaurant POS" },
  { company: "PickQwik" },
];

// ============================================
// HELPERS
// ============================================

async function getOrCreatePrimaryCompanyId(db: ReturnType<typeof drizzle>): Promise<number | null> {
  const all = await db.select({ id: companies.id, type: companies.type }).from(companies);
  if (all.length === 0) return null;
  const parent = all.find(c => (c.type as any) === "parent");
  return (parent ?? all[0]).id;
}

async function getOrCreateSubsidiaryId(db: ReturnType<typeof drizzle>, name: string): Promise<number> {
  const [existing] = await db.select().from(companies).where(eq(companies.name, name));
  if (existing) return existing.id;
  const result = await db.insert(companies).values({
    name,
    type: "subsidiary",
    country: "IN",
  } as any);
  return (result as any)[0]?.insertId ?? (result as any).insertId;
}

// ============================================
// IMPORT FUNCTIONS
// ============================================

async function importSaProducts(db: ReturnType<typeof drizzle>, companyId: number | null) {
  let created = 0;
  let priceTiersCreated = 0;
  let bandsCreated = 0;
  let regionalSkusCreated = 0;

  const all = [...SA_PRODUCTS, ...SA_RETAIL_ONLY.map(r => ({ ...r, foodservicePackSize: undefined, foodserviceBasePrice: undefined }))] as any[];

  for (const row of all) {
    // 1. Parent product (lookup by sku)
    let [existingProduct] = await db.select().from(products).where(eq(products.sku, row.parentSku));
    let productId: number;
    if (existingProduct) {
      productId = existingProduct.id;
    } else {
      const result = await db.insert(products).values({
        companyId: companyId ?? undefined,
        sku: row.parentSku,
        name: row.name,
        category: row.category,
        type: "physical",
        manufacturingStage: "finished_product",
        unitPrice: String(row.retailMsrp ?? row.retailWholesale ?? row.foodserviceBasePrice ?? 0),
        currency: "ZAR",
        taxable: true,
        status: "active",
      } as any);
      productId = (result as any)[0]?.insertId ?? (result as any).insertId;
      created++;
    }

    // 2. SA regional SKU (only if different from parent sku)
    if (row.regionalSku && row.regionalSku !== row.parentSku) {
      const [existingSku] = await db.select().from(productRegionalSkus).where(and(
        eq(productRegionalSkus.productId, productId),
        eq(productRegionalSkus.region, "ZA"),
      ));
      if (!existingSku) {
        await db.insert(productRegionalSkus).values({
          productId,
          region: "ZA",
          regionalSku: row.regionalSku,
          localName: row.name,
          status: "active",
        } as any);
        regionalSkusCreated++;
      }
    }

    // 3. Price tiers — foodservice, retail wholesale, retail MSRP
    const tiersToInsert: { channel: any; pricePerUnit: number; packSize?: string }[] = [];
    if (row.foodserviceBasePrice != null) {
      tiersToInsert.push({ channel: "foodservice",  pricePerUnit: row.foodserviceBasePrice, packSize: row.foodservicePackSize });
    }
    if (row.retailWholesale != null) {
      tiersToInsert.push({ channel: "wholesale",    pricePerUnit: row.retailWholesale,    packSize: row.retailPackSize });
    }
    if (row.retailMsrp != null) {
      tiersToInsert.push({ channel: "retail_msrp", pricePerUnit: row.retailMsrp,         packSize: row.retailPackSize });
    }

    for (const t of tiersToInsert) {
      const [existingTier] = await db.select().from(productPriceTiers).where(and(
        eq(productPriceTiers.productId, productId),
        eq(productPriceTiers.region, "ZA"),
        eq(productPriceTiers.channel, t.channel),
        eq(productPriceTiers.status, "active"),
      ));
      let tierId: number;
      if (existingTier) {
        tierId = existingTier.id;
      } else {
        const result = await db.insert(productPriceTiers).values({
          productId,
          region: "ZA",
          channel: t.channel,
          currency: "ZAR",
          packSize: t.packSize,
          unitOfMeasure: "kg",
          pricePerUnit: String(t.pricePerUnit),
          taxMode: "exclusive",
          taxRate: "15.00", // SA VAT
          minOrderQty: "25",
          effectiveFrom: EFFECTIVE_FROM,
          status: "active",
          contractOnly: false,
          notes: "Imported from Superhumn SA Price List May 2026",
        } as any);
        tierId = (result as any)[0]?.insertId ?? (result as any).insertId;
        priceTiersCreated++;
      }

      // Volume discount bands (skip for retail_msrp — discounts apply to wholesale only)
      if (t.channel === "retail_msrp") continue;
      const existingBands = await db.select().from(productVolumeDiscounts).where(eq(productVolumeDiscounts.priceTierId, tierId));
      if (existingBands.length === 0) {
        await db.insert(productVolumeDiscounts).values(
          SA_VOLUME_BANDS.map(b => ({
            priceTierId: tierId,
            minQty: b.minQty,
            maxQty: b.maxQty,
            discountPercent: b.discountPercent,
            notes: b.notes,
          })) as any,
        );
        bandsCreated += SA_VOLUME_BANDS.length;
      }
    }
  }

  console.log(`  products: +${created}  regional SKUs: +${regionalSkusCreated}  tiers: +${priceTiersCreated}  bands: +${bandsCreated}`);
}

async function importIndiaProject(db: ReturnType<typeof drizzle>, companyId: number | null): Promise<number | null> {
  const [existing] = await db.select().from(projects).where(eq(projects.name, INDIA_PROJECT_NAME));
  let projectId: number;
  if (existing) {
    projectId = existing.id;
    console.log(`  project '${INDIA_PROJECT_NAME}' already exists (id=${projectId})`);
  } else {
    const result = await db.insert(projects).values({
      companyId: companyId ?? undefined,
      projectNumber: `INDIA-LAUNCH-2026`,
      name: INDIA_PROJECT_NAME,
      description: "36-month India market entry: JV, co-packer, FSSAI, IRCTC tender, hotel/restaurant accounts, e-commerce, own facility.",
      status: "active",
      priority: "high",
      startDate: new Date("2026-05-01T00:00:00Z"),
    } as any);
    projectId = (result as any)[0]?.insertId ?? (result as any).insertId;
    console.log(`  created project '${INDIA_PROJECT_NAME}' (id=${projectId})`);
  }

  let tasksCreated = 0;
  for (const task of INDIA_TASKS) {
    const [existingTask] = await db.select().from(projectTasks).where(and(
      eq(projectTasks.projectId, projectId),
      eq(projectTasks.name, task.name),
    ));
    if (existingTask) continue;
    const statusMap: Record<string, string> = {
      not_started: "todo",
      in_progress: "in_progress",
      complete: "completed",
    };
    await db.insert(projectTasks).values({
      projectId,
      name: task.name,
      description: [task.notes, `Phase: ${task.phase}`, `Category: ${task.category}`].filter(Boolean).join("\n"),
      status: statusMap[task.status] ?? "todo",
      priority: "medium",
    } as any);
    tasksCreated++;
  }
  console.log(`  tasks: +${tasksCreated}`);
  return projectId;
}

async function importGovernmentTenders(db: ReturnType<typeof drizzle>, companyId: number | null, projectId: number | null) {
  let created = 0;
  for (const t of INDIA_TENDERS) {
    const [existing] = await db.select().from(governmentTenders).where(eq(governmentTenders.title, t.title));
    if (existing) continue;
    await db.insert(governmentTenders).values({
      companyId: companyId ?? undefined,
      title: t.title,
      portal: t.portal,
      category: t.category,
      agency: t.agency,
      country: "IN",
      state: t.state,
      currency: "INR",
      status: t.status,
      classILocalSupplier: t.classILocalSupplier ?? false,
      fssaiRequired: t.fssaiRequired ?? false,
      projectId: projectId ?? undefined,
      notes: t.notes,
    } as any);
    created++;
  }
  console.log(`  tenders: +${created}`);
}

async function importLicenses(db: ReturnType<typeof drizzle>, companyId: number | null, projectId: number | null) {
  let created = 0;
  for (const l of INDIA_LICENSES) {
    const [existing] = await db.select().from(regulatoryLicenses).where(and(
      eq(regulatoryLicenses.licenseType, l.licenseType),
      eq(regulatoryLicenses.country, l.country),
    ));
    if (existing) continue;
    await db.insert(regulatoryLicenses).values({
      companyId: companyId ?? undefined,
      licenseType: l.licenseType,
      country: l.country,
      state: l.state,
      authority: l.authority,
      status: l.status,
      renewalReminderDays: 60,
      currency: l.country === "IN" ? "INR" : "EUR",
      projectId: projectId ?? undefined,
      notes: l.notes,
    } as any);
    created++;
  }
  console.log(`  licenses: +${created}`);
}

async function importSubsidiaryRound(db: ReturnType<typeof drizzle>, parentCompanyId: number | null) {
  const subsidiaryId = await getOrCreateSubsidiaryId(db, "Superhumn India JV");
  const roundName = "India JV Seed";
  const [existing] = await db.select().from(subsidiaryFundraisingRounds).where(and(
    eq(subsidiaryFundraisingRounds.subsidiaryCompanyId, subsidiaryId),
    eq(subsidiaryFundraisingRounds.name, roundName),
  ));
  if (existing) {
    console.log(`  round '${roundName}' already exists (id=${existing.id})`);
    return;
  }
  await db.insert(subsidiaryFundraisingRounds).values({
    subsidiaryCompanyId: subsidiaryId,
    parentCompanyId: parentCompanyId ?? undefined,
    name: roundName,
    roundType: "seed",
    targetAmount: "2000000",
    currency: "USD",
    parentOwnershipPctBefore: "100",
    parentOwnershipPctAfter: "49",
    openedDate: new Date("2026-05-01T00:00:00Z"),
    status: "open",
    notes: "$2m raise from local India partners. JV is 49% Superhumn / 51% India partner & investor owned.",
  } as any);
  console.log(`  round '${roundName}' created (subsidiary id=${subsidiaryId})`);
}

async function importAmbassadors(db: ReturnType<typeof drizzle>, companyId: number | null, projectId: number | null) {
  let created = 0;
  for (const a of AMBASSADOR_SHORTLIST) {
    const [existing] = await db.select().from(brandAmbassadors).where(eq(brandAmbassadors.name, a.name));
    if (existing) continue;
    await db.insert(brandAmbassadors).values({
      companyId: companyId ?? undefined,
      name: a.name,
      type: a.type,
      category: a.category,
      country: a.country,
      followerCount: a.followerCount,
      stage: "shortlist",
      priority: "high",
      campaignName: "Superhumn animated series character",
      currency: "USD",
      projectId: projectId ?? undefined,
      notes: a.notes,
    } as any);
    created++;
  }
  console.log(`  ambassadors: +${created}`);
}

async function importCrmSeed(db: ReturnType<typeof drizzle>, companyId: number | null) {
  let created = 0;
  for (const c of CRM_SEED) {
    const [existing] = await db.select().from(crmContacts).where(eq(crmContacts.organization, c.company));
    if (existing) continue;
    const fullName = c.contact ?? c.company;
    const [firstName, ...rest] = fullName.split(/\s+/);
    const lastName = rest.join(" ") || undefined;
    await db.insert(crmContacts).values({
      companyId: companyId ?? undefined,
      firstName: firstName,
      lastName: lastName,
      fullName: fullName,
      organization: c.company,
      notes: c.notes,
      contactType: "lead",
      source: "import",
      pipelineStage: "new",
    } as any);
    created++;
  }
  console.log(`  crm contacts: +${created}`);
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log("Connecting to database...");
  const connection = await mysql.createConnection(url!);
  const db = drizzle(connection);

  const companyId = await getOrCreatePrimaryCompanyId(db);
  console.log(`Using primary company id: ${companyId ?? "(none — companies table empty)"}`);

  console.log("\n[1/7] Importing SA price list...");
  await importSaProducts(db, companyId);

  console.log("\n[2/7] Importing India launch project + tasks...");
  const projectId = await importIndiaProject(db, companyId);

  console.log("\n[3/7] Importing government tenders...");
  await importGovernmentTenders(db, companyId, projectId);

  console.log("\n[4/7] Importing regulatory licenses...");
  await importLicenses(db, companyId, projectId);

  console.log("\n[5/7] Importing subsidiary fundraising round...");
  await importSubsidiaryRound(db, companyId);

  console.log("\n[6/7] Importing brand ambassadors (shortlist)...");
  await importAmbassadors(db, companyId, projectId);

  console.log("\n[7/7] Importing CRM seed contacts...");
  await importCrmSeed(db, companyId);

  await connection.end();
  console.log("\nDone.");
}

main().catch(err => {
  console.error("Import failed:", err);
  process.exit(1);
});
