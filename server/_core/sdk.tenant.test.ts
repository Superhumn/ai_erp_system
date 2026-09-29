import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  multiTenant: true,
  tenantsJson: "",
  tenantBaseDomain: "",
  appId: "app",
  cookieSecret: "test-secret-that-is-at-least-32-characters",
}));
vi.mock("./env", () => ({ ENV: env }));
vi.mock("../db", () => ({}));

import { sdk } from "./sdk";
import { runWithTenant, type Tenant } from "./tenancy";

const acme: Tenant = { slug: "acme", databaseUrl: "mysql://h/acme", hosts: [], status: "active" };
const globex: Tenant = { slug: "globex", databaseUrl: "mysql://h/globex", hosts: [], status: "active" };

describe("session tenant binding", () => {
  beforeEach(() => {
    env.multiTenant = true;
  });

  it("accepts a session only on the tenant that issued it", async () => {
    const token = await runWithTenant(acme, () => sdk.createSessionToken("user-1", { name: "A" }));
    expect(await runWithTenant(acme, () => sdk.verifySession(token))).toMatchObject({ openId: "user-1", tid: "acme" });
    expect(await runWithTenant(globex, () => sdk.verifySession(token))).toBeNull();
    expect(await sdk.verifySession(token)).toBeNull();
  });

  it("rejects a tenantless (single-tenant era) session in multi-tenant mode", async () => {
    env.multiTenant = false;
    const legacy = await sdk.createSessionToken("user-1", { name: "A" });
    env.multiTenant = true;
    expect(await runWithTenant(acme, () => sdk.verifySession(legacy))).toBeNull();
  });

  it("refuses to issue a session outside a tenant", async () => {
    await expect(sdk.createSessionToken("user-1", { name: "A" })).rejects.toThrow(/No tenant/);
  });

  it("is unchanged in single-tenant mode", async () => {
    env.multiTenant = false;
    const token = await sdk.createSessionToken("user-1", { name: "A" });
    expect(await sdk.verifySession(token)).toEqual({ openId: "user-1", appId: "app", name: "A" });
  });
});
