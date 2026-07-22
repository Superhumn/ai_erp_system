/**
 * Import co-packer (contract packer) records into the ERP.
 *
 * Co-packers are tracked two ways in this system:
 *   - warehouses (type = "copacker") — location identity used by the copacker
 *     portal, inventory updates, and recipe sharing.
 *   - vendors (type = "contractor") — billing identity that holds banking,
 *     tax (VAT / GST), and payment-term details.
 *
 * This script seeds both records for each co-packer below.
 *
 * Idempotent: each section looks up an existing row (warehouse by name,
 * vendor by name) before inserting.
 *
 * Usage:
 *   pnpm db:push          # ensure schema is applied first
 *   tsx scripts/import-copackers.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { warehouses, vendors, companies } from "../drizzle/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// ============================================
// SOURCE DATA — CO-PACKERS
// ============================================

type Copacker = {
  name: string;
  code: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string; // ISO-2
  postalCode?: string;
  taxId?: string; // VAT / GST
  bankAccount?: string;
  bankRouting?: string; // IFSC for India
  /** Free-form details that have no dedicated column. */
  notes: string;
};

const COPACKERS: Copacker[] = [
  // ---------- SOUTH AFRICA ----------
  {
    name: "Big Ciabatta Worx (Pty) Ltd",
    code: "COPK-ZA-BCW",
    contactName: "Geoff Wheeler",
    email: "accounts@bcwgroup.co.za",
    phone: "+27 21 979 5456",
    address: "7 Oostenberg St, Cape Farms",
    city: "Cape Town",
    country: "ZA",
    postalCode: "7550",
    taxId: "4430279712", // VAT number
    notes: [
      "Co-packer — South Africa",
      "Contact: Geoff Wheeler (+27 21 979 5456)",
      "Import number: 21815800",
      "VAT number: 4430279712",
      "Registration number: 2017/372106/07",
    ].join("\n"),
  },
  // ---------- INDIA ----------
  {
    name: "Sampige Foods",
    code: "COPK-IN-SAMPIGE",
    contactName: "R Prasant Pillai",
    email: "rprasantpillai@gmail.com",
    phone: "+91 99458 51391",
    address: "122/1, 21st Cross Rd, NS Palya, Stage 2, BTM Layout",
    city: "Bengaluru",
    state: "Karnataka",
    country: "IN",
    postalCode: "560076",
    taxId: "29AEMFS8179J1ZZ", // GST
    bankAccount: "50200064651180",
    bankRouting: "HDFC0000514", // IFSC
    notes: [
      "Co-packer — India",
      "Contact: R Prasant Pillai (+91 99458 51391, rprasantpillai@gmail.com)",
      "GST: 29AEMFS8179J1ZZ",
      "Bank: HDFC Bank Ltd — Current Account",
      "Account number: 50200064651180",
      "IFSC: HDFC0000514",
      "SWIFT: HDFCINBBBNG",
      "Branch: HDFC Bank Dollars Colony, No 18 KR Layout, Dollars Colony Phase 4, Bangalore 560078",
    ].join("\n"),
  },
  {
    name: "Eunat Organics and Naturals Pvt Ltd",
    code: "COPK-IN-EUNAT",
    email: "eunatorganics@gmail.com",
    phone: "+91 99109 88522",
    address: "23, Sri Raghavendra Arcade, Manipal County Road, Singasandra",
    city: "Bengaluru",
    state: "Karnataka",
    country: "IN",
    postalCode: "560068",
    taxId: "29AAFCE9736P1ZP", // GSTIN/UIN
    notes: [
      "Co-packer — India",
      "Email: eunatorganics@gmail.com",
      "Mobile: +91 99109 88522",
      "GSTIN/UIN: 29AAFCE9736P1ZP",
    ].join("\n"),
  },
];

// ============================================
// HELPERS
// ============================================

async function getOrCreatePrimaryCompanyId(db: ReturnType<typeof drizzle>): Promise<number | null> {
  const all = await db.select({ id: companies.id, type: companies.type }).from(companies);
  if (all.length === 0) return null;
  const parent = all.find((c) => (c.type as any) === "parent");
  return (parent ?? all[0]).id;
}

// ============================================
// IMPORT
// ============================================

async function importCopackers(db: ReturnType<typeof drizzle>, companyId: number | null) {
  let warehousesCreated = 0;
  let vendorsCreated = 0;

  for (const c of COPACKERS) {
    // 1. Warehouse (type = copacker) — location identity.
    const [existingWarehouse] = await db.select().from(warehouses).where(eq(warehouses.name, c.name));
    if (existingWarehouse) {
      console.log(`  warehouse '${c.name}' already exists (id=${existingWarehouse.id})`);
    } else {
      await db.insert(warehouses).values({
        companyId: companyId ?? undefined,
        name: c.name,
        code: c.code,
        address: c.address,
        city: c.city,
        state: c.state,
        country: c.country,
        postalCode: c.postalCode,
        type: "copacker",
        status: "active",
        contactName: c.contactName,
        contactEmail: c.email,
        contactPhone: c.phone,
        isPrimary: false,
        notes: c.notes,
      } as any);
      warehousesCreated++;
    }

    // 2. Vendor (type = contractor) — billing / banking / tax identity.
    const [existingVendor] = await db.select().from(vendors).where(eq(vendors.name, c.name));
    if (existingVendor) {
      console.log(`  vendor '${c.name}' already exists (id=${existingVendor.id})`);
    } else {
      await db.insert(vendors).values({
        companyId: companyId ?? undefined,
        name: c.name,
        contactName: c.contactName,
        email: c.email,
        phone: c.phone,
        address: c.address,
        city: c.city,
        state: c.state,
        country: c.country,
        postalCode: c.postalCode,
        type: "contractor",
        status: "active",
        paymentTerms: 30,
        taxId: c.taxId,
        bankAccount: c.bankAccount,
        bankRouting: c.bankRouting,
        notes: c.notes,
      } as any);
      vendorsCreated++;
    }
  }

  console.log(`  warehouses (copacker): +${warehousesCreated}  vendors: +${vendorsCreated}`);
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

  console.log("\nImporting co-packers...");
  await importCopackers(db, companyId);

  await connection.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
