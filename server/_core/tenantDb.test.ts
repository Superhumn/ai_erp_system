import { beforeEach, describe, expect, it, vi } from "vitest";

const createPool = vi.hoisted(() => vi.fn((opts: { uri: string }) => ({ uri: opts.uri, end: vi.fn((cb?: () => void) => cb?.()) })));
vi.mock("mysql2", () => ({ default: { createPool } }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: (pool: { uri: string }) => ({ pool }) }));

import { closeAllTenantPools, getTenantDb } from "./tenantDb";
import type { Tenant } from "./tenancy";

const tenant = (slug: string, databaseUrl = `mysql://h/${slug}`): Tenant => ({ slug, databaseUrl, hosts: [], status: "active" });

describe("getTenantDb", () => {
  beforeEach(async () => {
    await closeAllTenantPools();
    createPool.mockClear();
  });

  it("gives each tenant its own pool on its own database", () => {
    const a = getTenantDb(tenant("acme")) as unknown as { pool: { uri: string } };
    const b = getTenantDb(tenant("globex")) as unknown as { pool: { uri: string } };
    expect(a.pool.uri).toBe("mysql://h/acme");
    expect(b.pool.uri).toBe("mysql://h/globex");
    expect(createPool).toHaveBeenCalledTimes(2);
  });

  it("reuses the pool for repeat calls", () => {
    expect(getTenantDb(tenant("acme"))).toBe(getTenantDb(tenant("acme")));
    expect(createPool).toHaveBeenCalledTimes(1);
  });

  it("replaces and closes the pool when the database URL rotates", () => {
    const first = getTenantDb(tenant("acme")) as unknown as { pool: { end: () => void } };
    const second = getTenantDb(tenant("acme", "mysql://h/acme-rotated")) as unknown as { pool: { uri: string } };
    expect(second.pool.uri).toBe("mysql://h/acme-rotated");
    expect(first.pool.end).toHaveBeenCalled();
  });
});
