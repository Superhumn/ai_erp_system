import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from '../drizzle/schema';
import { sql } from 'drizzle-orm';
import 'dotenv/config';

const db = drizzle(process.env.DATABASE_URL!);

async function deleteAllProducts() {
  console.log("Deleting all products...\n");

  // First delete order items that reference products
  try {
    const result = await db.delete(schema.orderItems);
    console.log("  Cleared order items");
  } catch (e: any) {
    console.log("  Order items: " + (e.message || "skipped"));
  }

  // Delete inventory records
  try {
    await db.delete(schema.inventory);
    console.log("  Cleared inventory");
  } catch (e: any) {
    console.log("  Inventory: " + (e.message || "skipped"));
  }

  // Delete products
  try {
    const products = await db.select({ id: schema.products.id, name: schema.products.name }).from(schema.products);
    console.log(`\n  Found ${products.length} products to delete:`);
    for (const p of products) {
      try {
        await db.delete(schema.products).where(sql`id = ${p.id}`);
        console.log(`    ✓ Deleted: ${p.name}`);
      } catch (e: any) {
        console.log(`    ✗ ${p.name}: ${e.message}`);
      }
    }
  } catch (e: any) {
    console.error("  Failed to delete products:", e.message);
  }

  console.log("\nDone.");
  process.exit(0);
}

deleteAllProducts().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
