import { afterAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Multi-tenant getDb() must pick the tenant's database and never fall back to DATABASE_URL.
vi.mock("./_core/env", async (orig) => {
  const actual = await orig<typeof import("./_core/env")>();
  return { ...actual, ENV: { ...actual.ENV, multiTenant: true, tenantsJson: "[]" } };
});
vi.mock("./_core/tenantDb", () => ({
  getTenantDb: (t: { slug: string }) => ({ tenant: t.slug }),
}));

import * as legacyDb from "./db";
import * as connection from "./db/connection";
import { runWithTenant, type Tenant } from "./_core/tenancy";

const originalUrl = process.env.DATABASE_URL;
afterAll(() => {
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});

const acme: Tenant = { slug: "acme", databaseUrl: "mysql://h/acme", hosts: [], status: "active" };

describe.each([
  ["server/db.ts", legacyDb.getDb],
  ["server/db/connection.ts", connection.getDb],
])("%s getDb in multi-tenant mode", (_label, getDb) => {
  it("throws outside a tenant, even with DATABASE_URL set", async () => {
    process.env.DATABASE_URL = "mysql://h/should-never-be-used";
    await expect(getDb()).rejects.toThrow(/No tenant/);
  });

  it("returns the current tenant's database", async () => {
    expect(await runWithTenant(acme, () => getDb())).toEqual({ tenant: "acme" });
  });
});

describe("platform owner in multi-tenant mode", () => {
  it("is not auto-promoted to admin inside a tenant", () => {
    const src = readFileSync(path.resolve(__dirname, "db.ts"), "utf8");
    expect(src).toContain("} else if (!isMultiTenant() && user.openId === ENV.ownerOpenId) {");
  });
});
