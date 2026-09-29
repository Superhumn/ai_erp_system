// ============================================================================
// Paid-ads lead intake webhooks
// ----------------------------------------------------------------------------
//   GET  /webhooks/ads/meta/leads   Meta's subscription handshake (hub.challenge)
//   POST /webhooks/ads/meta/leads   Meta leadgen events → fetch each lead by id
//   POST /webhooks/ads/leads        Our own landing-page form (Reddit traffic,
//                                   any page). JSON body; secret in the
//                                   x-webhook-secret header (or Bearer token).
//                                   Never in the query string — it would land
//                                   in access logs.
//
// Both routes stay thin: verify, parse, hand off to adMarketingService.
// ============================================================================
import type { Express, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { createHmac, timingSafeEqual } from "crypto";
import { ENV } from "./env";
import { secureCompare } from "./crypto";
import * as db from "../db";
import { extractMetaLeadgenIds, fetchMetaLead } from "./adPlatforms";
import { ingestAdLead, ingestPlatformLead, platformCredentials } from "../adMarketingService";
import { parseUtm } from "../../shared/adMarketing";
import { createLogger } from "./logger";
import type { AdPlatform } from "../../drizzle/schema";

const logger = createLogger("AdWebhooks");

/**
 * Which Meta platform a leadgen event belongs to. Matched on the page id;
 * an event without one is accepted only when a single Meta platform exists,
 * so a lead can never be filed under another account's entity.
 */
export function pickMetaPlatform<T extends Pick<AdPlatform, "pageId">>(platforms: T[], pageId: string | undefined): T | undefined {
  if (pageId) return platforms.find((p) => p.pageId === pageId);
  return platforms.length === 1 ? platforms[0] : undefined;
}

/** Meta signs the raw body with the app secret: `sha256=<hex hmac>`. */
export function verifyMetaSignature(rawBody: Buffer | string, header: string | undefined, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const [algo, sig] = header.split("=");
  if (algo !== "sha256" || !sig) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

type Middleware = (req: Request, res: Response, next: () => void) => void;

// Same shape as the webhook limiter in index.ts, declared here so the limiter
// is visibly attached to every ads webhook route (Meta retries in bursts).
const adWebhookLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many webhook requests" },
});

/**
 * The exact request bytes. The app-level JSON parser runs first and stashes
 * them on req.rawBody (index.ts); express.raw on the route covers bodies the
 * global parser skipped. Signatures are checked over these bytes, never over
 * a re-serialised object.
 */
export function rawBodyOf(req: Request): Buffer {
  const stashed = (req as Request & { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(stashed)) return stashed;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  return Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
}

function rawJson(req: Request): { body: any; raw: Buffer } | null {
  const raw = rawBodyOf(req);
  try {
    const text = raw.toString("utf8");
    const body = text ? JSON.parse(text) : {};
    return body && typeof body === "object" && !Array.isArray(body) ? { body, raw } : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

/** Landing-page form → intake input. Field names are what our own form sends; a few aliases are tolerated. */
export function landingPayloadToLead(body: Record<string, unknown>) {
  const utmFromUrl = parseUtm(str(body.pageUrl) ?? str(body.page_url) ?? str(body.url));
  const utm = {
    source: str(body.utm_source) ?? utmFromUrl.source,
    medium: str(body.utm_medium) ?? utmFromUrl.medium,
    campaign: str(body.utm_campaign) ?? utmFromUrl.campaign,
    content: str(body.utm_content) ?? utmFromUrl.content,
    id: str(body.utm_id) ?? utmFromUrl.id,
  };
  const { email, name, fullName, firstName, lastName, phone, company, organization, jobTitle, ...rest } = body as Record<string, unknown>;
  return {
    email: str(email),
    fullName: str(fullName) ?? str(name),
    firstName: str(firstName),
    lastName: str(lastName),
    phone: str(phone),
    organization: str(organization) ?? str(company),
    jobTitle: str(jobTitle),
    utm,
    answers: rest,
  };
}

export function registerAdWebhooks(app: Express, reenterTenant: Middleware): void {
  // ---- Meta lead ads ------------------------------------------------------
  app.get("/webhooks/ads/meta/leads", adWebhookLimiter, (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    // Meta's challenge is an opaque numeric string. Echo it back as plain text
    // only after the verify token matched and it looks like one — never as HTML.
    if (
      mode === "subscribe" && ENV.metaWebhookVerifyToken && typeof token === "string" && secureCompare(token, ENV.metaWebhookVerifyToken) &&
      typeof challenge === "string" && /^[0-9A-Za-z_-]{1,128}$/.test(challenge)
    ) {
      return res.status(200).type("text/plain").send(challenge);
    }
    return res.status(403).json({ error: "Verification failed" });
  });

  app.post("/webhooks/ads/meta/leads", adWebhookLimiter, express.raw({ type: ["application/json", "*/*"] }), reenterTenant, async (req, res) => {
    const parsed = rawJson(req);
    if (!parsed) return res.status(400).json({ error: "Invalid JSON body" });
    if (!ENV.metaAppSecret) {
      if (ENV.isProduction) return res.status(403).json({ error: "META_APP_SECRET not configured" });
    } else if (!verifyMetaSignature(parsed.raw, req.headers["x-hub-signature-256"] as string | undefined, ENV.metaAppSecret)) {
      return res.status(401).json({ error: "Bad signature" });
    }
    // Meta retries unless it gets a 200 quickly; acknowledge first, then work.
    res.status(200).json({ received: true });
    const events = extractMetaLeadgenIds(parsed.body);
    if (events.length === 0) return;
    try {
      const platforms = await db.getAdPlatformsByName("meta");
      for (const ev of events) {
        const platform = pickMetaPlatform(platforms, ev.pageId);
        if (!platform) {
          logger.warn("Meta lead received for a page no platform is set up for; ignored", { leadgenId: ev.leadgenId, pageId: ev.pageId, platforms: platforms.length });
          await db.createAdSyncLog({ kind: "lead_sync", period: new Date().toISOString().slice(0, 10), status: "failed", message: `Meta lead ${ev.leadgenId} for page ${ev.pageId ?? "?"} matched no platform (set the page id on the Platforms tab)`, finishedAt: new Date() }).catch(() => null);
          continue;
        }
        const creds = platformCredentials(platform);
        if (!creds) {
          logger.warn("Meta platform has no token; lead recorded without form answers", { leadgenId: ev.leadgenId });
          await ingestAdLead({ source: "meta", platformId: platform.id, externalLeadId: ev.leadgenId, answers: { formId: ev.formId, adId: ev.adId }, companyId: platform.companyId });
          continue;
        }
        const lead = await fetchMetaLead(creds, ev.leadgenId);
        await ingestPlatformLead(platform, lead);
      }
    } catch (e) {
      logger.error("Meta lead processing failed", { error: e instanceof Error ? e.message : String(e) });
      await db.createAdSyncLog({ kind: "lead_sync", period: new Date().toISOString().slice(0, 10), status: "failed", message: e instanceof Error ? e.message : String(e), finishedAt: new Date() }).catch(() => null);
    }
  });

  // ---- Landing page form ---------------------------------------------------
  app.use("/webhooks/ads/leads", adWebhookLimiter, (req, res, next) => {
    // Header or Bearer only. A ?secret= would be copied into proxy/access logs.
    const provided =
      (req.headers["x-webhook-secret"] as string) ||
      (req.headers["authorization"] as string)?.replace(/^Bearer\s+/i, "");
    const expected = ENV.adLeadWebhookSecret;
    if (!expected) {
      if (ENV.isProduction) return res.status(403).json({ error: "AD_LEAD_WEBHOOK_SECRET not configured" });
      return next();
    }
    if (!provided || !secureCompare(provided, expected)) return res.status(401).json({ error: "Invalid webhook secret" });
    next();
  });

  app.post("/webhooks/ads/leads", adWebhookLimiter, express.raw({ type: ["application/json", "text/plain", "*/*"] }), reenterTenant, async (req, res) => {
    const parsed = rawJson(req);
    if (!parsed) return res.status(400).json({ error: "Invalid JSON body" });
    const lead = landingPayloadToLead(parsed.body);
    if (!lead.email && !lead.fullName) return res.status(400).json({ error: "A name or email is required" });
    try {
      const source = (lead.utm.source ?? "").toLowerCase();
      const result = await ingestAdLead({
        source: source === "reddit" ? "reddit" : source === "linkedin" ? "linkedin" : source === "meta" || source === "instagram" || source === "facebook" ? "meta" : "landing_page",
        ...lead,
      });
      res.status(200).json({ success: true, leadId: result.leadId, contactId: result.contactId, duplicate: result.duplicate });
    } catch (e) {
      logger.error("Landing page lead failed", { error: e instanceof Error ? e.message : String(e) });
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
