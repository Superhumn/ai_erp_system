import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

async function runMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set, skipping migrations");
    process.exit(1);
  }

  console.log("[migrate] Running database migrations...");
  // multipleStatements is required because drizzle-orm sends each SQL chunk
  // (everything between --> statement-breakpoint markers) as a single query.
  // Several historical migrations contain multiple ; -separated DDLs without
  // breakpoint markers, and mysql2 silently drops everything past the first
  // statement unless this flag is set.
  const connection = await mysql.createPool({ uri: url, multipleStatements: true });
  const db = drizzle(connection);

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
