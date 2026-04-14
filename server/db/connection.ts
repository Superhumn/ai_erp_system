import { drizzle } from "drizzle-orm/mysql2";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("[Database] DATABASE_URL environment variable is not set");
    }
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}
