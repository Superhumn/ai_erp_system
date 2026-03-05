/**
 * Database Seed Script
 * Run: pnpm tsx server/seed.ts
 *
 * Seeds the database with sample data for development/demo purposes.
 * Safe to run multiple times — checks for existing data before inserting.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";

async function seed() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
    process.exit(1);
  }

  const pool = mysql.createPool(dbUrl);
  const db = drizzle(pool, { schema, mode: "default" });

  console.log("Seeding database...\n");

  // Check if data already exists
  const existingUsers = await db.select().from(schema.users).limit(1);
  if (existingUsers.length > 0) {
    console.log("Database already has data. Skipping seed to avoid duplicates.");
    console.log("To re-seed, truncate the tables first.");
    await pool.end();
    return;
  }

  // 1. Users (admin + sample roles)
  console.log("Creating users...");
  await db.insert(schema.users).values([
    { openId: "admin-001", name: "Admin User", email: "admin@company.com", role: "admin", loginMethod: "email" },
    { openId: "ops-001", name: "Sarah Operations", email: "sarah@company.com", role: "ops", loginMethod: "email" },
    { openId: "finance-001", name: "Mike Finance", email: "mike@company.com", role: "finance", loginMethod: "email" },
    { openId: "exec-001", name: "Lisa Executive", email: "lisa@company.com", role: "exec", loginMethod: "email" },
    { openId: "legal-001", name: "Tom Legal", email: "tom@company.com", role: "legal", loginMethod: "email" },
    { openId: "procurement-001", name: "Ana Procurement", email: "ana@company.com", role: "user", loginMethod: "email" },
    { openId: "vendor-001", name: "Vendor User", email: "vendor@supplier.com", role: "vendor", loginMethod: "email", linkedVendorId: 1 },
    { openId: "copacker-001", name: "Copacker User", email: "copacker@copack.com", role: "copacker", loginMethod: "email", linkedWarehouseId: 1 },
  ]);

  // 2. Warehouses
  console.log("Creating warehouses...");
  await db.insert(schema.warehouses).values([
    { name: "Main Warehouse", code: "WH-MAIN", address: "100 Industrial Blvd", city: "Los Angeles", state: "CA", country: "US", postalCode: "90001", type: "warehouse", isPrimary: true },
    { name: "East Coast DC", code: "WH-EAST", address: "200 Commerce St", city: "Newark", state: "NJ", country: "US", postalCode: "07101", type: "distribution" },
    { name: "Copacker Facility", code: "WH-COPA", address: "300 Production Ave", city: "Chicago", state: "IL", country: "US", postalCode: "60601", type: "copacker", contactName: "Copacker User", contactEmail: "copacker@copack.com" },
  ]);

  // 3. Vendors
  console.log("Creating vendors...");
  await db.insert(schema.vendors).values([
    { name: "Pacific Raw Materials Co", contactName: "John Pacific", email: "john@pacificraw.com", phone: "310-555-0101", address: "500 Harbor Dr", city: "Long Beach", state: "CA", country: "US", type: "supplier", status: "active", paymentTerms: 30, defaultLeadTimeDays: 14 },
    { name: "Global Ingredients Ltd", contactName: "Maria Global", email: "maria@globalingredients.com", phone: "212-555-0202", address: "600 Trade Center", city: "New York", state: "NY", country: "US", type: "supplier", status: "active", paymentTerms: 45, defaultLeadTimeDays: 21 },
    { name: "EcoPack Solutions", contactName: "David Eco", email: "david@ecopack.com", phone: "312-555-0303", address: "700 Green Way", city: "Chicago", state: "IL", country: "US", type: "supplier", status: "active", paymentTerms: 30, defaultLeadTimeDays: 7 },
    { name: "TechServices Inc", contactName: "Amy Tech", email: "amy@techservices.com", phone: "415-555-0404", city: "San Francisco", state: "CA", country: "US", type: "service", status: "active", paymentTerms: 15 },
    { name: "Midwest Logistics", contactName: "Bob Midwest", email: "bob@midwestlogistics.com", phone: "614-555-0505", city: "Columbus", state: "OH", country: "US", type: "contractor", status: "active", paymentTerms: 30 },
  ]);

  // 4. Customers
  console.log("Creating customers...");
  await db.insert(schema.customers).values([
    { name: "Whole Foods Market", email: "purchasing@wholefoods.example.com", phone: "512-555-1001", city: "Austin", state: "TX", country: "US", type: "business", status: "active", paymentTerms: 30, creditLimit: "50000.00" },
    { name: "Trader Joe's", email: "buying@traderjoes.example.com", phone: "626-555-1002", city: "Monrovia", state: "CA", country: "US", type: "business", status: "active", paymentTerms: 45, creditLimit: "75000.00" },
    { name: "Amazon Fresh", email: "vendor@amazonfresh.example.com", phone: "206-555-1003", city: "Seattle", state: "WA", country: "US", type: "business", status: "active", paymentTerms: 60, creditLimit: "100000.00" },
    { name: "Local Grocery Co-op", email: "orders@localgrocery.example.com", phone: "503-555-1004", city: "Portland", state: "OR", country: "US", type: "business", status: "active", paymentTerms: 15, creditLimit: "10000.00" },
    { name: "Jane Smith", email: "jane.smith@example.com", phone: "555-1005", city: "Denver", state: "CO", country: "US", type: "individual", status: "active" },
  ]);

  // 5. Products
  console.log("Creating products...");
  await db.insert(schema.products).values([
    { sku: "PRD-001", name: "Organic Granola Bar (12-pack)", category: "Snacks", unitPrice: "24.99", costPrice: "12.50", type: "physical", status: "active", preferredVendorId: 1 },
    { sku: "PRD-002", name: "Cold-Pressed Juice Variety (6-pack)", category: "Beverages", unitPrice: "35.99", costPrice: "18.00", type: "physical", status: "active" },
    { sku: "PRD-003", name: "Protein Energy Bites (24-pack)", category: "Snacks", unitPrice: "19.99", costPrice: "8.75", type: "physical", status: "active" },
    { sku: "PRD-004", name: "Herbal Tea Collection (20 bags)", category: "Beverages", unitPrice: "12.99", costPrice: "4.50", type: "physical", status: "active", preferredVendorId: 2 },
    { sku: "PRD-005", name: "Nut Butter Sampler (3 jars)", category: "Pantry", unitPrice: "29.99", costPrice: "14.00", type: "physical", status: "active" },
  ]);

  // 6. Raw Materials
  console.log("Creating raw materials...");
  await db.insert(schema.rawMaterials).values([
    { sku: "RM-001", name: "Organic Rolled Oats", category: "Grains", unit: "KG", unitCost: "2.50", minOrderQty: "100", leadTimeDays: 14, preferredVendorId: 1, status: "active" },
    { sku: "RM-002", name: "Raw Honey", category: "Sweeteners", unit: "KG", unitCost: "8.00", minOrderQty: "50", leadTimeDays: 7, preferredVendorId: 2, status: "active" },
    { sku: "RM-003", name: "Almond Butter", category: "Nut Products", unit: "KG", unitCost: "12.00", minOrderQty: "25", leadTimeDays: 10, preferredVendorId: 1, status: "active" },
    { sku: "RM-004", name: "Dark Chocolate Chips", category: "Confectionery", unit: "KG", unitCost: "6.50", minOrderQty: "50", leadTimeDays: 14, preferredVendorId: 2, status: "active" },
    { sku: "RM-005", name: "Whey Protein Isolate", category: "Proteins", unit: "KG", unitCost: "15.00", minOrderQty: "25", leadTimeDays: 21, preferredVendorId: 1, status: "active" },
    { sku: "RM-006", name: "Coconut Oil (Virgin)", category: "Oils", unit: "L", unitCost: "5.50", minOrderQty: "50", leadTimeDays: 14, preferredVendorId: 2, status: "active" },
    { sku: "RM-007", name: "Dried Cranberries", category: "Fruits", unit: "KG", unitCost: "9.00", minOrderQty: "25", leadTimeDays: 10, preferredVendorId: 1, status: "active" },
    { sku: "RM-008", name: "Packaging Film (Mylar)", category: "Packaging", unit: "M", unitCost: "0.15", minOrderQty: "1000", leadTimeDays: 7, preferredVendorId: 3, status: "active" },
    { sku: "RM-009", name: "Corrugated Shipping Box (12-ct)", category: "Packaging", unit: "EA", unitCost: "1.20", minOrderQty: "500", leadTimeDays: 5, preferredVendorId: 3, status: "active" },
    { sku: "RM-010", name: "Product Labels (Roll)", category: "Packaging", unit: "EA", unitCost: "0.05", minOrderQty: "5000", leadTimeDays: 10, preferredVendorId: 3, status: "active" },
  ]);

  // 7. Bill of Materials (for Granola Bar)
  console.log("Creating BOMs...");
  const [bomResult] = await db.insert(schema.billOfMaterials).values([
    { productId: 1, name: "Organic Granola Bar Recipe", version: "1.0", status: "active", batchSize: "100", batchUnit: "EA", laborCost: "50.00", overheadCost: "25.00" },
    { productId: 3, name: "Protein Energy Bites Recipe", version: "1.0", status: "active", batchSize: "200", batchUnit: "EA", laborCost: "40.00", overheadCost: "20.00" },
  ]);

  // 8. BOM Components (for Granola Bar BOM id=1)
  console.log("Creating BOM components...");
  await db.insert(schema.bomComponents).values([
    { bomId: 1, componentType: "raw_material", rawMaterialId: 1, name: "Organic Rolled Oats", quantity: "5.0", unit: "KG", unitCost: "2.50", wastagePercent: "2.00", sortOrder: 1 },
    { bomId: 1, componentType: "raw_material", rawMaterialId: 2, name: "Raw Honey", quantity: "1.5", unit: "KG", unitCost: "8.00", wastagePercent: "1.00", sortOrder: 2 },
    { bomId: 1, componentType: "raw_material", rawMaterialId: 3, name: "Almond Butter", quantity: "2.0", unit: "KG", unitCost: "12.00", wastagePercent: "1.50", sortOrder: 3 },
    { bomId: 1, componentType: "raw_material", rawMaterialId: 4, name: "Dark Chocolate Chips", quantity: "1.0", unit: "KG", unitCost: "6.50", wastagePercent: "0.50", sortOrder: 4 },
    { bomId: 1, componentType: "raw_material", rawMaterialId: 7, name: "Dried Cranberries", quantity: "0.5", unit: "KG", unitCost: "9.00", wastagePercent: "1.00", sortOrder: 5 },
    { bomId: 1, componentType: "packaging", rawMaterialId: 8, name: "Packaging Film (Mylar)", quantity: "100", unit: "M", unitCost: "0.15", sortOrder: 6 },
    { bomId: 1, componentType: "packaging", rawMaterialId: 9, name: "Corrugated Shipping Box", quantity: "9", unit: "EA", unitCost: "1.20", sortOrder: 7 },
    { bomId: 1, componentType: "packaging", rawMaterialId: 10, name: "Product Labels", quantity: "100", unit: "EA", unitCost: "0.05", sortOrder: 8 },
    // Protein Bites BOM components
    { bomId: 2, componentType: "raw_material", rawMaterialId: 5, name: "Whey Protein Isolate", quantity: "4.0", unit: "KG", unitCost: "15.00", wastagePercent: "1.00", sortOrder: 1 },
    { bomId: 2, componentType: "raw_material", rawMaterialId: 3, name: "Almond Butter", quantity: "3.0", unit: "KG", unitCost: "12.00", wastagePercent: "2.00", sortOrder: 2 },
    { bomId: 2, componentType: "raw_material", rawMaterialId: 6, name: "Coconut Oil", quantity: "1.0", unit: "L", unitCost: "5.50", wastagePercent: "1.00", sortOrder: 3 },
    { bomId: 2, componentType: "raw_material", rawMaterialId: 2, name: "Raw Honey", quantity: "2.0", unit: "KG", unitCost: "8.00", wastagePercent: "1.00", sortOrder: 4 },
  ]);

  // 9. Accounts (Chart of Accounts)
  console.log("Creating accounts...");
  await db.insert(schema.accounts).values([
    { code: "1000", name: "Cash", type: "asset", subType: "current_asset", isActive: true },
    { code: "1100", name: "Accounts Receivable", type: "asset", subType: "current_asset", isActive: true },
    { code: "1200", name: "Inventory", type: "asset", subType: "current_asset", isActive: true },
    { code: "2000", name: "Accounts Payable", type: "liability", subType: "current_liability", isActive: true },
    { code: "3000", name: "Owner's Equity", type: "equity", subType: "owners_equity", isActive: true },
    { code: "4000", name: "Sales Revenue", type: "revenue", subType: "operating_revenue", isActive: true },
    { code: "5000", name: "Cost of Goods Sold", type: "expense", subType: "cost_of_goods", isActive: true },
    { code: "5100", name: "Raw Materials", type: "expense", subType: "cost_of_goods", isActive: true },
    { code: "6000", name: "Operating Expenses", type: "expense", subType: "operating_expense", isActive: true },
    { code: "6100", name: "Shipping & Freight", type: "expense", subType: "operating_expense", isActive: true },
  ]);

  // 10. Departments
  console.log("Creating departments...");
  await db.insert(schema.departments).values([
    { name: "Operations", description: "Manufacturing, fulfillment, and logistics" },
    { name: "Finance", description: "Accounting, payments, and financial planning" },
    { name: "Sales", description: "Customer relationships and order management" },
    { name: "Procurement", description: "Vendor management and purchasing" },
    { name: "Quality Assurance", description: "Product quality and compliance" },
  ]);

  console.log("\nSeed complete! Created:");
  console.log("  - 8 users (admin, ops, finance, exec, legal, procurement, vendor, copacker)");
  console.log("  - 3 warehouses");
  console.log("  - 5 vendors");
  console.log("  - 5 customers");
  console.log("  - 5 products");
  console.log("  - 10 raw materials");
  console.log("  - 2 BOMs with 12 components");
  console.log("  - 10 accounts (chart of accounts)");
  console.log("  - 5 departments");

  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
