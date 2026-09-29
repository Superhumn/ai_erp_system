import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// server/_core/index.ts calls startServer() at module scope (DB migrations,
// listeners, pollers), so it cannot be imported in a unit test. These tests
// pin the middleware ordering and webhook/auth invariants at the source level
// instead, so a refactor that silently reorders them fails CI.
const src = readFileSync(path.resolve(__dirname, "index.ts"), "utf8");
const localAuthSrc = readFileSync(path.resolve(__dirname, "localAuth.ts"), "utf8");

const idx = (needle: string, from = 0) => {
  const i = src.indexOf(needle, from);
  if (i < 0) throw new Error(`Expected to find ${JSON.stringify(needle)} in index.ts`);
  return i;
};

describe("index.ts webhook raw-body wiring", () => {
  it("captures the raw request bytes in the global express.json parser", () => {
    const jsonMount = idx("express.json({");
    const block = src.slice(jsonMount, jsonMount + 300);
    expect(block).toMatch(/limit:\s*"50mb"/);
    expect(block).toMatch(/verify:\s*\(req,\s*_res,\s*buf\)/);
    expect(block).toContain("rawBody = buf");
  });

  it("verifies SendGrid and Shopify signatures against req.rawBody, not the parsed object", () => {
    const jsonMount = idx("express.json({");
    const helper = idx("const getRawBody = (req: any): Buffer =>");
    const sendgrid = idx("app.post('/webhooks/sendgrid/events'");
    const shopify = idx("const handleShopifyWebhook = async");
    expect(jsonMount).toBeLessThan(helper);
    expect(helper).toBeLessThan(sendgrid);
    expect(helper).toBeLessThan(shopify);

    const helperBody = src.slice(helper, helper + 500);
    expect(helperBody).toContain("if (Buffer.isBuffer(req.rawBody)) return req.rawBody;");
    expect(helperBody).toContain("if (Buffer.isBuffer(req.body)) return req.body;");

    const sendgridBody = src.slice(sendgrid, idx("// Shopify webhooks", sendgrid));
    expect(sendgridBody).toContain("const rawBody = getRawBody(req).toString('utf8');");
    expect(sendgridBody).toContain("verifyWebhookSignature(ENV.sendgridWebhookSecret, rawBody,");
    expect(sendgridBody).toContain("JSON.parse(rawBody)");
    expect(sendgridBody).not.toMatch(/JSON\.stringify\(req\.body\)/);

    const shopifyBody = src.slice(shopify, idx("app.post('/webhooks/shopify/orders'", shopify));
    expect(shopifyBody).toContain("const rawBody = getRawBody(req).toString('utf8');");
    expect(shopifyBody).toContain("processShopifyWebhook(rawBody,");
  });
});

describe("index.ts CSRF origin check", () => {
  it("skips the Origin check for signature-verified Twilio callbacks under /api/twilio/*", () => {
    const csrf = idx('app.use("/api/", (req, res, next) => {');
    const missingOrigin = idx('"Missing Origin header"', csrf);
    const bypass = idx('req.path.startsWith("/twilio/")', csrf);
    // The bypass must run before the request can be rejected for a missing Origin.
    expect(bypass).toBeLessThan(missingOrigin);
    expect(src.slice(bypass, bypass + 60)).toMatch(/return next\(\)/);
  });

  it("trusts exactly one proxy hop so req.ip reflects the real client", () => {
    expect(src).toContain('app.set("trust proxy", 1)');
  });
});

describe("shared-secret comparisons", () => {
  it("never compares secrets with === / !== in index.ts or localAuth.ts", () => {
    // Any env var that looks like a credential (SECRET / KEY / TOKEN / PASSWORD), on either side of === / !==.
    const secretRef = "(process\\.env\\.[A-Z_]*(SECRET|KEY|TOKEN|PASSWORD)[A-Z_]*|ENV\\.[a-zA-Z]*(Secret|Key|Token|Password)\\b)";
    const plainCompare = new RegExp(`[!=]==\\s*${secretRef}|${secretRef}\\s*[!=]==`);
    expect(src).not.toMatch(plainCompare);
    expect(localAuthSrc).not.toMatch(plainCompare);
  });

  it("uses the timing-safe helper for EDI, B2B Rocket and JWT-secret gated routes", () => {
    expect(src).toContain('import { secureCompare } from "./crypto"');
    expect(src).toContain("if (!secureCompare(apiKey, expectedKey))");
    expect(src).toContain("if (!secureCompare(provided, expected))");
    expect(localAuthSrc).toContain('import { secureCompare } from "./crypto"');
    expect(localAuthSrc.match(/!secureCompare\(secret, process\.env\.JWT_SECRET\)/g)?.length).toBe(2);
  });
});

describe("localAuth getClientIp", () => {
  it("uses Express's proxy-aware req.ip instead of client-controlled headers", () => {
    const start = localAuthSrc.indexOf("function getClientIp(req: Request): string {");
    expect(start).toBeGreaterThan(-1);
    const body = localAuthSrc.slice(start, localAuthSrc.indexOf("}", start) + 1);
    expect(body).toContain("return req.ip ||");
    expect(body).not.toMatch(/headers\[['"]x-forwarded-for['"]\]/);
    expect(body).not.toMatch(/headers\[['"]x-real-ip['"]\]/);
  });
});

describe("IMAP poll loop", () => {
  it("skips already-saved messages (by messageId) before importing attachments or notifying", () => {
    const loop = idx("const processInbox = async (inbox: any) => {");
    const dedupe = idx("db.findInboundEmailByMessageId?.(email.messageId)", loop);
    const save = idx("db.createInboundEmail?.({", loop);
    const importCall = idx("bulkImportDocuments(docs, 1, true)", loop);
    const notify = idx("db.createNotification({", loop);
    expect(dedupe).toBeLessThan(save);
    expect(save).toBeLessThan(importCall);
    expect(importCall).toBeLessThan(notify);
    // The dedupe hit must short-circuit the rest of the per-message body.
    expect(src.slice(dedupe, dedupe + 120)).toMatch(/if \(alreadySaved\) continue;/);
  });
});

describe("index.ts tenant routing", () => {
  it("mounts tenantMiddleware after the body parsers and before every route", () => {
    const tenant = idx("app.use(tenantMiddleware);");
    expect(idx("express.json({")).toBeLessThan(tenant);
    expect(idx("app.use(express.urlencoded(")).toBeLessThan(tenant);
    expect(tenant).toBeLessThan(idx("registerOAuthRoutes(app);"));
    expect(tenant).toBeLessThan(idx("app.post('/webhooks/sendgrid/events'"));
    expect(tenant).toBeLessThan(idx('app.use("/api/trpc"'));
  });

  it("re-enters the tenant after every per-route express.raw parser", () => {
    const raws = [...src.matchAll(/express\.raw\(\{[^}]*\}\),/g)];
    expect(raws.length).toBeGreaterThan(0);
    for (const m of raws) {
      const after = src.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
      expect(after.trimStart().startsWith("reenterTenant,")).toBe(true);
    }
  });

  it("keeps background workers off in multi-tenant mode", () => {
    const listen = idx('server.listen(port, "0.0.0.0"');
    const guard = idx("if (isMultiTenant()) {", listen);
    expect(guard).toBeLessThan(idx("startEmailQueueWorker();", listen));
  });
});

describe("index.ts webhook rate limiting", () => {
  it("rate-limits every /webhooks POST route", () => {
    const routes = [...src.matchAll(/app\.post\(\s*['"]\/webhooks\/[^'"]+['"],\s*(\w+)/g)];
    expect(routes.length).toBeGreaterThanOrEqual(5);
    for (const m of routes) expect(m[1]).toBe("webhookLimiter");
  });
});
