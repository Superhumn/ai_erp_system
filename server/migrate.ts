import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { pathToFileURL } from "node:url";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isDiskFullMigrationError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = error.code;
  if (typeof code === "string" && code === "ER_DISK_FULL_NOWAIT") return true;

  const cause = error.cause;
  if (isRecord(cause)) {
    const causeCode = cause.code;
    if (typeof causeCode === "string" && causeCode === "ER_DISK_FULL_NOWAIT") {
      return true;
    }
    const causeMessage = cause.sqlMessage ?? cause.message;
    if (
      typeof causeMessage === "string" &&
      causeMessage.toLowerCase().includes("disk is full")
    ) {
      return true;
    }
  }

  const message = error.message;
  return typeof message === "string" && message.toLowerCase().includes("disk is full");
}

export async function runMigrations() {
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
    if (
      process.env.MIGRATION_ALLOW_DISK_FULL_FAILURE === "true" &&
      isDiskFullMigrationError(error)
    ) {
      console.warn(
        "[migrate] WARNING: Migration skipped because database storage is full and MIGRATION_ALLOW_DISK_FULL_FAILURE is enabled. Schema may be out of date until DB storage is restored.",
      );
      process.exit(0);
    }
    console.error("[migrate] Migration failed:", error);
    process.exit(1);
  }
}

const invokedFile = process.argv[1];
if (invokedFile && import.meta.url === pathToFileURL(invokedFile).href) {
  void runMigrations();
}
