import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

async function runMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set, skipping migrations");
    process.exit(1);
  }

  console.log("[migrate] Running database migrations...");
  const db = drizzle(url);

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("[migrate] Migrations completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("[migrate] Migration failed:", error);
    process.exit(1);
  }
}

runMigrations();
