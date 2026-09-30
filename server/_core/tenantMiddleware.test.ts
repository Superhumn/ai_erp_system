import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ multiTenant: true, tenantsJson: "", tenantBaseDomain: "app.example.com" }));
vi.mock("./env", () => ({ ENV: env }));

import { currentTenant, markTenantUnavailable, resetTenantRegistryForTests } from "./tenancy";
import { reenterTenant, tenantMiddleware } from "./tenantMiddleware";

function call(host: string, path = "/api/trpc/x", mw = tenantMiddleware, locals: Record<string, unknown> = {}) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    locals,
    status(code: number) { this.statusCode = code; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  let slugInNext: string | undefined | null = null;
  const req = { hostname: host, headers: { host }, path };
  mw(req as never, res as never, () => { slugInNext = currentTenant()?.slug; });
  return { res, slugInNext };
}

describe("tenantMiddleware", () => {
  beforeEach(() => {
    env.multiTenant = true;
    env.tenantsJson = JSON.stringify([
      { slug: "acme", databaseUrl: "mysql://h/acme" },
      { slug: "frozen", databaseUrl: "mysql://h/frozen", status: "suspended" },
    ]);
    resetTenantRegistryForTests();
  });

  it("runs the request inside the resolved tenant", () => {
    const { res, slugInNext } = call("acme.app.example.com");
    expect(slugInNext).toBe("acme");
    expect(res.locals.tenant).toMatchObject({ slug: "acme" });
  });

  it("404s an unknown host without calling next", () => {
    const { res, slugInNext } = call("nobody.app.example.com");
    expect(res.statusCode).toBe(404);
    expect(slugInNext).toBeNull();
  });

  it("403s a suspended tenant", () => {
    const { res, slugInNext } = call("frozen.app.example.com");
    expect(res.statusCode).toBe(403);
    expect(slugInNext).toBeNull();
  });

  it("503s a tenant whose database failed boot checks", () => {
    markTenantUnavailable("acme");
    const { res, slugInNext } = call("acme.app.example.com");
    expect(res.statusCode).toBe(503);
    expect(slugInNext).toBeNull();
  });

  it("lets health checks through without a tenant", () => {
    expect(call("internal.railway", "/api/health").slugInNext).toBeUndefined();
  });

  it("is a pass-through in single-tenant mode", () => {
    env.multiTenant = false;
    expect(call("anything.example.org").slugInNext).toBeUndefined();
  });

  it("reenterTenant restores the tenant stored on res.locals", () => {
    const tenant = { slug: "acme", databaseUrl: "mysql://h/acme", hosts: [], status: "active" };
    expect(call("", "/webhooks/x", reenterTenant, { tenant }).slugInNext).toBe("acme");
  });
});
