import type { NextFunction, Request, Response } from "express";
import { ENV } from "./env";
import { getTenants, isMultiTenant, resolveTenantFromHost, runWithTenant, type Tenant } from "./tenancy";

// Platform liveness probes hit the service host, not a tenant host.
const TENANTLESS_PATHS = new Set(["/health", "/api/health"]);

/**
 * Resolve the tenant from the Host header and run the rest of the request inside its context.
 * Unknown host → 404 (no hint whether a tenant exists). Suspended → 403.
 * Mount after the global body parsers: a parser that reads the stream later calls `next`
 * from a socket callback, which drops the AsyncLocalStorage context.
 */
export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isMultiTenant() || TENANTLESS_PATHS.has(req.path)) {
    next();
    return;
  }
  const tenant = resolveTenantFromHost(req.hostname || req.headers.host, getTenants(), ENV.tenantBaseDomain);
  if (!tenant) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (tenant.status !== "active") {
    res.status(403).json({ error: "This workspace is suspended. Contact support." });
    return;
  }
  res.locals.tenant = tenant;
  runWithTenant(tenant, next);
}

/**
 * Re-enter the tenant context after a per-route body parser (e.g. `express.raw`) that read
 * the stream itself. Place it directly after that parser.
 */
export function reenterTenant(_req: Request, res: Response, next: NextFunction): void {
  const tenant = res.locals.tenant as Tenant | undefined;
  if (tenant) runWithTenant(tenant, next);
  else next();
}
