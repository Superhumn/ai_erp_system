// Tenant isolation: one database per customer (see docs/MULTI_TENANT_PLAN.md).
//
// A tenant is an outside customer. Each one gets its own MySQL database, so a missed WHERE
// clause can never return another customer's rows. `companyId` keeps its existing meaning:
// legal entities *inside* one tenant.
//
// The request's tenant lives in AsyncLocalStorage. `getDb()` reads it and hands back that
// tenant's pool. In multi-tenant mode there is no default database: code that runs without a
// tenant fails closed instead of silently hitting someone's data.

import { AsyncLocalStorage } from "node:async_hooks";
import { ENV } from "./env";

export type TenantStatus = "active" | "suspended";

export interface Tenant {
  /** Stable lowercase key, also the subdomain: `acme` → acme.<base domain>. */
  slug: string;
  databaseUrl: string;
  /** Extra hostnames (custom domains) that route to this tenant. Lowercase, no port. */
  hosts: string[];
  status: TenantStatus;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export class TenantConfigError extends Error {}

/** Parse and validate the `TENANTS_JSON` registry. Throws on any malformed or duplicate entry. */
export function parseTenantRegistry(raw: string): Tenant[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TenantConfigError("TENANTS_JSON is not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new TenantConfigError("TENANTS_JSON must be a JSON array");

  const slugs = new Set<string>();
  const hosts = new Set<string>();
  return parsed.map((entry: unknown, i) => {
    if (typeof entry !== "object" || entry === null) {
      throw new TenantConfigError(`TENANTS_JSON[${i}] must be an object`);
    }
    const e = entry as Record<string, unknown>;
    const slug = typeof e.slug === "string" ? e.slug.trim().toLowerCase() : "";
    if (!SLUG_RE.test(slug)) throw new TenantConfigError(`TENANTS_JSON[${i}].slug is invalid`);
    if (slugs.has(slug)) throw new TenantConfigError(`TENANTS_JSON has duplicate slug "${slug}"`);
    slugs.add(slug);

    const databaseUrl = typeof e.databaseUrl === "string" ? e.databaseUrl.trim() : "";
    if (!/^mysql:\/\//.test(databaseUrl)) {
      throw new TenantConfigError(`TENANTS_JSON[${i}] ("${slug}") needs a mysql:// databaseUrl`);
    }

    const rawHosts = e.hosts ?? [];
    if (!Array.isArray(rawHosts) || rawHosts.some((h) => typeof h !== "string")) {
      throw new TenantConfigError(`TENANTS_JSON[${i}] ("${slug}").hosts must be an array of strings`);
    }
    const tenantHosts = (rawHosts as string[]).map(normalizeHost).filter((h) => h.length > 0);
    for (const h of tenantHosts) {
      if (hosts.has(h)) throw new TenantConfigError(`TENANTS_JSON host "${h}" is claimed twice`);
      hosts.add(h);
    }

    const status = e.status ?? "active";
    if (status !== "active" && status !== "suspended") {
      throw new TenantConfigError(`TENANTS_JSON[${i}] ("${slug}").status must be active or suspended`);
    }

    return { slug, databaseUrl, hosts: tenantHosts, status };
  });
}

/** Lowercase, strip port and trailing dot. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/**
 * Pick the tenant for a request host. Custom domains win; otherwise a single-label subdomain
 * of `baseDomain`. Anything else (the bare base domain, nested subdomains, unknown hosts)
 * resolves to null.
 */
export function resolveTenantFromHost(
  hostHeader: string | undefined,
  tenants: readonly Tenant[],
  baseDomain: string,
): Tenant | null {
  if (!hostHeader) return null;
  const host = normalizeHost(hostHeader);
  if (!host) return null;

  const byHost = tenants.find((t) => t.hosts.includes(host));
  if (byHost) return byHost;

  const base = normalizeHost(baseDomain);
  if (!base || !host.endsWith(`.${base}`)) return null;
  const label = host.slice(0, -(base.length + 1));
  if (label.includes(".")) return null;
  return tenants.find((t) => t.slug === label) ?? null;
}

// ── Runtime state ────────────────────────────────────────────────────────────

const storage = new AsyncLocalStorage<Tenant>();
let registryCache: Tenant[] | null = null;

export function isMultiTenant(): boolean {
  return ENV.multiTenant;
}

/** The configured tenants. Parsed once; throws a TenantConfigError if the registry is invalid. */
export function getTenants(): Tenant[] {
  if (!registryCache) registryCache = parseTenantRegistry(ENV.tenantsJson || "[]");
  return registryCache;
}

/** Test hook: forget the parsed registry so a changed ENV is re-read. */
export function resetTenantRegistryForTests(): void {
  registryCache = null;
}

export function currentTenant(): Tenant | undefined {
  return storage.getStore();
}

export class NoTenantContextError extends Error {
  constructor() {
    super("No tenant in context. Multi-tenant mode refuses database access outside a tenant.");
  }
}

export function requireTenant(): Tenant {
  const t = storage.getStore();
  if (!t) throw new NoTenantContextError();
  return t;
}

export function runWithTenant<T>(tenant: Tenant, fn: () => T): T {
  return storage.run(tenant, fn);
}

/**
 * Run `fn` once per active tenant, sequentially, each inside that tenant's context.
 * One tenant's failure is collected and does not stop the others.
 */
export async function forEachTenant(
  fn: (tenant: Tenant) => Promise<void>,
): Promise<{ slug: string; error: unknown }[]> {
  const failures: { slug: string; error: unknown }[] = [];
  for (const tenant of getTenants()) {
    if (tenant.status !== "active") continue;
    try {
      await runWithTenant(tenant, () => fn(tenant));
    } catch (error) {
      failures.push({ slug: tenant.slug, error });
    }
  }
  return failures;
}
