import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  multiTenant: true,
  tenantsJson: "",
  tenantBaseDomain: "",
  cookieSecret: "test-secret-that-is-at-least-32-characters",
}));
vi.mock("./env", () => ({ ENV: env }));

import { signVisitorSession, verifyVisitorSession } from "./dataRoomVisitorSession";
import { runWithTenant, type Tenant } from "./tenancy";

const acme: Tenant = { slug: "acme", databaseUrl: "mysql://h/acme", hosts: [], status: "active" };
const globex: Tenant = { slug: "globex", databaseUrl: "mysql://h/globex", hosts: [], status: "active" };
const payload = { visitorId: 7, linkId: 3, linkCode: "abc", dataRoomId: 1 };

describe("data room visitor session tenant binding", () => {
  beforeEach(() => {
    env.multiTenant = true;
  });

  it("accepts a token only on the tenant that issued it", async () => {
    const token = await runWithTenant(acme, () => signVisitorSession(payload));
    expect(await runWithTenant(acme, () => verifyVisitorSession(token))).toEqual(payload);
    expect(await runWithTenant(globex, () => verifyVisitorSession(token))).toBeNull();
    expect(await verifyVisitorSession(token)).toBeNull();
  });

  it("rejects a token without a tenant claim in multi-tenant mode", async () => {
    env.multiTenant = false;
    const legacy = await signVisitorSession(payload);
    env.multiTenant = true;
    expect(await runWithTenant(acme, () => verifyVisitorSession(legacy))).toBeNull();
  });

  it("refuses to issue a token outside a tenant", async () => {
    await expect(signVisitorSession(payload)).rejects.toThrow(/No tenant/);
  });

  it("is unchanged in single-tenant mode", async () => {
    env.multiTenant = false;
    const token = await signVisitorSession(payload);
    expect(await verifyVisitorSession(token)).toEqual(payload);
  });
});
