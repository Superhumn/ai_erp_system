// ============================================================================
// Paid-ads lead intake webhooks
// ----------------------------------------------------------------------------
//   GET  /webhooks/ads/meta/leads   Meta's subscription handshake (hub.challenge)
//   POST /webhooks/ads/meta/leads   Meta leadgen events → fetch each lead by id
//   POST /webhooks/ads/leads        Our own landing-page form (Reddit traffic,
//                                   any page). JSON body; secret in the
//                                   x-webhook-secret header or ?secret=.
//
// Both routes stay thin: verify, parse, hand off to adMarketingService.
// ============================================================================
import type { Express, Request, Response } from "express";
import express from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { ENV } from "./env";
import { secureCompare } from "./crypto";
import * as db from "../db";
import { extractMetaLeadgenIds, fetchMetaLead } from "./adPlatforms";
import { ingestAdLead, ingestPlatformLead, platformCredentials } from "../adMarketingService";
import { parseUtm } from "../../shared/adMarketing";

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

function rawJson(req: Request): { body: any; raw: string } | null {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  try {
    const body = raw ? JSON.parse(raw) : {};
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

export function registerAdWebhooks(app: Express, webhookLimiter: Middleware, reenterTenant: Middleware): void {
  // ---- Meta lead ads ------------------------------------------------------
  app.get("/webhooks/ads/meta/leads", webhookLimiter, (req, res) => {
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

  app.post("/webhooks/ads/meta/leads", webhookLimiter, express.raw({ type: ["application/json", "*/*"] }), reenterTenant, async (req, res) => {
    const parsed = rawJson(req);
    if (!parsed) return res.status(400).json({ error: "Invalid JSON body" });
    if (!ENV.metaAppSecret) {
      if (ENV.isProduction) return res.status(403).json({ error: "META_APP_SECRET not configured" });
    } else if (!verifyMetaSignature(Buffer.isBuffer(req.body) ? req.body : parsed.raw, req.headers["x-hub-signature-256"] as string | undefined, ENV.metaAppSecret)) {
      return res.status(401).json({ error: "Bad signature" });
    }
    // Meta retries unless it gets a 200 quickly; acknowledge first, then work.
    res.status(200).json({ received: true });
    const events = extractMetaLeadgenIds(parsed.body);
    if (events.length === 0) return;
    try {
      const platforms = await db.getAdPlatformsByName("meta");
      for (const ev of events) {
        const platform = platforms.find((p) => ev.pageId && p.pageId === ev.pageId) ?? platforms[0];
        if (!platform) {
          console.warn("[Ads Webhook] Meta lead received but no Meta platform is set up", ev);
          continue;
        }
        const creds = platformCredentials(platform);
        if (!creds) {
          console.warn("[Ads Webhook] Meta platform has no token; lead recorded without form answers", ev.leadgenId);
          await ingestAdLead({ source: "meta", platformId: platform.id, externalLeadId: ev.leadgenId, answers: { formId: ev.formId, adId: ev.adId }, companyId: platform.companyId });
          continue;
        }
        const lead = await fetchMetaLead(creds, ev.leadgenId);
        await ingestPlatformLead(platform, lead);
      }
    } catch (e) {
      console.error("[Ads Webhook] Meta lead processing failed:", e);
      await db.createAdSyncLog({ kind: "lead_sync", period: new Date().toISOString().slice(0, 10), status: "failed", message: e instanceof Error ? e.message : String(e) }).catch(() => null);
    }
  });

  // ---- Landing page form ---------------------------------------------------
  app.use("/webhooks/ads/leads", webhookLimiter, (req, res, next) => {
    const provided =
      (req.headers["x-webhook-secret"] as string) ||
      (req.headers["authorization"] as string)?.replace(/^Bearer\s+/i, "") ||
      (req.query.secret as string);
    const expected = ENV.adLeadWebhookSecret;
    if (!expected) {
      if (ENV.isProduction) return res.status(403).json({ error: "AD_LEAD_WEBHOOK_SECRET not configured" });
      return next();
    }
    if (!provided || !secureCompare(provided, expected)) return res.status(401).json({ error: "Invalid webhook secret" });
    next();
  });

  app.post("/webhooks/ads/leads", express.raw({ type: ["application/json", "text/plain", "*/*"] }), reenterTenant, async (req, res) => {
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
      console.error("[Ads Webhook] Landing page lead failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
