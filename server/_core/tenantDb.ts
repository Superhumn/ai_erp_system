// One connection pool per tenant database, created on first use and kept for the process
// lifetime. Pools are small: many tenants share one app process, and MySQL caps connections
// per server, not per database.

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import type { Tenant } from "./tenancy";

const POOL_SIZE_PER_TENANT = 5;

type TenantDb = ReturnType<typeof drizzle>;

interface Entry {
  databaseUrl: string;
  pool: mysql.Pool;
  db: TenantDb;
}

const entries = new Map<string, Entry>();

export function getTenantDb(tenant: Tenant): TenantDb {
  const existing = entries.get(tenant.slug);
  // A changed URL (credential rotation) gets a fresh pool; the old one drains in the background.
  if (existing && existing.databaseUrl === tenant.databaseUrl) return existing.db;
  if (existing) existing.pool.end(() => {});

  const pool = mysql.createPool({
    uri: tenant.databaseUrl,
    connectionLimit: POOL_SIZE_PER_TENANT,
    maxIdle: POOL_SIZE_PER_TENANT,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  });
  const db = drizzle(pool);
  entries.set(tenant.slug, { databaseUrl: tenant.databaseUrl, pool, db });
  return db;
}

export async function closeAllTenantPools(): Promise<void> {
  const pools = [...entries.values()].map((e) => e.pool);
  entries.clear();
  await Promise.all(pools.map((p) => new Promise<void>((resolve) => p.end(() => resolve()))));
}
