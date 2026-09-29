import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ multiTenant: true, tenantsJson: "", tenantBaseDomain: "app.example.com" }));
vi.mock("./env", () => ({ ENV: env }));

import {
  appUrlForLinks,
  currentTenant,
  databaseIdentity,
  isSameTenantOrigin,
  isTenantAvailable,
  markTenantUnavailable,
  forEachTenant,
  getTenants,
  NoTenantContextError,
  parseTenantRegistry,
  requireTenant,
  resetTenantRegistryForTests,
  resolveTenantFromHost,
  runWithTenant,
  TenantConfigError,
  type Tenant,
} from "./tenancy";

const acme: Tenant = { slug: "acme", databaseUrl: "mysql://a/acme", hosts: ["erp.acme.com"], status: "active" };
const globex: Tenant = { slug: "globex", databaseUrl: "mysql://g/globex", hosts: [], status: "active" };

describe("parseTenantRegistry", () => {
  it("normalizes slugs and hosts and defaults status to active", () => {
    const [t] = parseTenantRegistry(
      JSON.stringify([{ slug: " Acme ", databaseUrl: "mysql://x/acme", hosts: ["ERP.Acme.com:443"] }]),
    );
    expect(t).toEqual({ slug: "acme", databaseUrl: "mysql://x/acme", hosts: ["erp.acme.com"], status: "active" });
  });

  it.each([
    ["not json", "{"],
    ["not an array", "{}"],
    ["bad slug", JSON.stringify([{ slug: "a_b", databaseUrl: "mysql://x" }])],
    ["missing url", JSON.stringify([{ slug: "a" }])],
    ["non-mysql url", JSON.stringify([{ slug: "a", databaseUrl: "postgres://x" }])],
    ["duplicate slug", JSON.stringify([{ slug: "a", databaseUrl: "mysql://x" }, { slug: "A", databaseUrl: "mysql://y" }])],
    [
      "host claimed twice",
      JSON.stringify([
        { slug: "a", databaseUrl: "mysql://x", hosts: ["erp.x.com"] },
        { slug: "b", databaseUrl: "mysql://y", hosts: ["ERP.x.com"] },
      ]),
    ],
    ["bad status", JSON.stringify([{ slug: "a", databaseUrl: "mysql://x", status: "deleted" }])],
    [
      "two tenants on one database",
      JSON.stringify([
        { slug: "a", databaseUrl: "mysql://u1:p1@DB.host:3306/shared" },
        { slug: "b", databaseUrl: "mysql://u2:p2@db.host/shared?ssl=true" },
      ]),
    ],
    [
      "a custom host under the base domain",
      JSON.stringify([
        { slug: "acme", databaseUrl: "mysql://h/acme" },
        { slug: "globex", databaseUrl: "mysql://h/globex", hosts: ["acme.app.example.com"] },
      ]),
    ],
  ])("rejects %s", (_label, raw) => {
    expect(() => parseTenantRegistry(raw, "app.example.com")).toThrow(TenantConfigError);
  });

  it("treats different schemas on one server as different databases", () => {
    expect(databaseIdentity("mysql://u@h:3306/a")).not.toBe(databaseIdentity("mysql://u@h:3306/b"));
    expect(databaseIdentity("mysql://u:x@H/a")).toBe(databaseIdentity("mysql://v:y@h:3306/A"));
  });
});

describe("resolveTenantFromHost", () => {
  const tenants = [acme, globex];
  const base = "app.example.com";

  it("routes a subdomain of the base domain to its slug", () => {
    expect(resolveTenantFromHost("globex.app.example.com", tenants, base)).toBe(globex);
    expect(resolveTenantFromHost("GLOBEX.app.example.com:8443", tenants, base)).toBe(globex);
  });

  it("routes a custom domain", () => {
    expect(resolveTenantFromHost("erp.acme.com", tenants, base)).toBe(acme);
  });

  it.each([
    ["no host", undefined],
    ["bare base domain", "app.example.com"],
    ["nested subdomain", "x.globex.app.example.com"],
    ["unknown subdomain", "initech.app.example.com"],
    ["lookalike domain", "globex.app.example.com.evil.io"],
    ["suffix without dot", "globexapp.example.com"],
  ])("returns null for %s", (_label, host) => {
    expect(resolveTenantFromHost(host, tenants, base)).toBeNull();
  });

  it("ignores subdomains when no base domain is configured", () => {
    expect(resolveTenantFromHost("globex.app.example.com", tenants, "")).toBeNull();
  });
});

describe("isSameTenantOrigin", () => {
  const tenants = [acme, globex];
  const base = "app.example.com";

  it("accepts an origin on the same tenant, by subdomain or custom domain", () => {
    expect(isSameTenantOrigin("acme.app.example.com", "acme.app.example.com", tenants, base)).toBe(true);
    expect(isSameTenantOrigin("erp.acme.com", "acme.app.example.com", tenants, base)).toBe(true);
  });

  it.each([
    ["another tenant", "globex.app.example.com"],
    ["an unknown host", "evil.example.org"],
  ])("rejects an origin on %s", (_label, origin) => {
    expect(isSameTenantOrigin(origin, "acme.app.example.com", tenants, base)).toBe(false);
  });
});

describe("tenant context", () => {
  beforeEach(() => {
    env.tenantsJson = JSON.stringify([
      acme,
      globex,
      { slug: "frozen", databaseUrl: "mysql://f/frozen", status: "suspended" },
    ]);
    resetTenantRegistryForTests();
  });

  it("fails closed outside a tenant", () => {
    expect(currentTenant()).toBeUndefined();
    expect(() => requireTenant()).toThrow(NoTenantContextError);
  });

  it("keeps the tenant across awaits and isolates concurrent runs", async () => {
    const seen = await Promise.all(
      [acme, globex].map((t) =>
        runWithTenant(t, async () => {
          await new Promise((r) => setTimeout(r, 5));
          return requireTenant().slug;
        }),
      ),
    );
    expect(seen).toEqual(["acme", "globex"]);
    expect(currentTenant()).toBeUndefined();
  });

  it("forEachTenant visits active tenants only and collects failures", async () => {
    const visited: string[] = [];
    const failures = await forEachTenant(async (t) => {
      visited.push(requireTenant().slug);
      if (t.slug === "acme") throw new Error("boom");
    });
    expect(visited).toEqual(["acme", "globex"]);
    expect(failures.map((f) => f.slug)).toEqual(["acme"]);
  });

  it("appUrlForLinks uses the current tenant's canonical URL", () => {
    expect(runWithTenant(acme, () => appUrlForLinks("https://fallback"))).toBe("https://erp.acme.com");
    expect(runWithTenant(globex, () => appUrlForLinks("https://fallback"))).toBe("https://globex.app.example.com");
    expect(() => appUrlForLinks("https://fallback")).toThrow(NoTenantContextError);
    env.multiTenant = false;
    expect(appUrlForLinks("https://fallback")).toBe("https://fallback");
    env.multiTenant = true;
  });

  it("tracks tenants that failed boot", () => {
    expect(isTenantAvailable("acme")).toBe(true);
    markTenantUnavailable("acme");
    expect(isTenantAvailable("acme")).toBe(false);
  });

  it("getTenants parses the registry from ENV", () => {
    expect(getTenants().map((t) => t.slug)).toEqual(["acme", "globex", "frozen"]);
  });
});
