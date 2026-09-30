import { drizzle } from "drizzle-orm/mysql2";
import { isMultiTenant, requireTenant } from "../_core/tenancy";
import { getTenantDb } from "../_core/tenantDb";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (isMultiTenant()) return getTenantDb(requireTenant());
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("[Database] DATABASE_URL environment variable is not set");
    }
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}
