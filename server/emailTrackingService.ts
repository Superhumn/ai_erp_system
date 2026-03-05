/**
 * Email Tracking Service
 *
 * Provides open tracking (pixel), click tracking (URL rewriting),
 * engagement analytics, and bounce management for outbound emails.
 */

import crypto from "crypto";
import * as db from "./db";
import { ENV } from "./_core/env";

// ============================================
// TRACKING PIXEL (Open Tracking)
// ============================================

const TRACKING_PIXEL_BASE64 =
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Generate a 1x1 transparent GIF pixel buffer for open tracking
 */
export function getTrackingPixelBuffer(): Buffer {
  return Buffer.from(TRACKING_PIXEL_BASE64, "base64");
}

/**
 * Generate the tracking pixel URL for an email message
 */
export function getTrackingPixelUrl(emailMessageId: number): string {
  const baseUrl = ENV.publicAppUrl || "http://localhost:3000";
  const token = generateTrackingToken(emailMessageId, "open");
  return `${baseUrl}/t/o/${token}.gif`;
}

/**
 * Insert a tracking pixel <img> tag into HTML email body
 */
export function injectTrackingPixel(html: string, emailMessageId: number): string {
  if (!html) return html;
  const pixelUrl = getTrackingPixelUrl(emailMessageId);
  const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none;border:0;" alt="" />`;

  // Insert before </body> if present, otherwise append
  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixelTag}</body>`);
  }
  return html + pixelTag;
}

// ============================================
// CLICK TRACKING (URL Rewriting)
// ============================================

/**
 * Rewrite all links in HTML email body to tracked redirect URLs.
 * Creates an emailLink record for each unique URL.
 */
export async function rewriteLinksForTracking(
  html: string,
  emailMessageId: number
): Promise<string> {
  if (!html) return html;

  const baseUrl = ENV.publicAppUrl || "http://localhost:3000";
  const urlRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
  const urlMap = new Map<string, string>();
  let match: RegExpExecArray | null;

  // Collect all unique URLs
  while ((match = urlRegex.exec(html)) !== null) {
    const originalUrl = match[1];
    // Skip tracking/unsubscribe URLs to avoid loops
    if (originalUrl.includes("/t/c/") || originalUrl.includes("/t/o/") || originalUrl.includes("unsubscribe")) {
      continue;
    }
    if (!urlMap.has(originalUrl)) {
      const trackingId = generateLinkTrackingId();
      await db.createEmailLink({
        emailMessageId,
        trackingId,
        originalUrl,
      });
      const trackedUrl = `${baseUrl}/t/c/${trackingId}`;
      urlMap.set(originalUrl, trackedUrl);
    }
  }

  // Replace URLs in HTML
  let result = html;
  for (const [originalUrl, trackedUrl] of urlMap) {
    result = result.split(originalUrl).join(trackedUrl);
  }

  return result;
}

/**
 * Process a click tracking redirect - record the click and return original URL
 */
export async function processClickRedirect(
  trackingId: string,
  metadata: { userAgent?: string; ip?: string }
): Promise<string | null> {
  const link = await db.getEmailLinkByTrackingId(trackingId);
  if (!link) return null;

  // Increment click count on the link
  await db.incrementEmailLinkClick(trackingId);

  // Record the tracking event
  const deviceInfo = parseUserAgent(metadata.userAgent || "");
  await db.createEmailTrackingEvent({
    emailMessageId: link.emailMessageId,
    eventType: "click",
    recipientEmail: "", // Will be populated from the emailMessage
    url: link.originalUrl,
    userAgent: metadata.userAgent || null,
    ip: metadata.ip || null,
    deviceType: deviceInfo.deviceType || null,
    os: deviceInfo.os || null,
    browser: deviceInfo.browser || null,
  });

  // Update engagement summary
  await updateEngagementOnClick(link.emailMessageId);

  return link.originalUrl;
}

// ============================================
// OPEN TRACKING PROCESSING
// ============================================

/**
 * Process a tracking pixel open event
 */
export async function processOpenEvent(
  token: string,
  metadata: { userAgent?: string; ip?: string }
): Promise<boolean> {
  const emailMessageId = decodeTrackingToken(token, "open");
  if (!emailMessageId) return false;

  const message = await db.getEmailMessageById(emailMessageId);
  if (!message) return false;

  const deviceInfo = parseUserAgent(metadata.userAgent || "");

  await db.createEmailTrackingEvent({
    emailMessageId,
    eventType: "open",
    recipientEmail: message.toEmail,
    userAgent: metadata.userAgent || null,
    ip: metadata.ip || null,
    deviceType: deviceInfo.deviceType || null,
    os: deviceInfo.os || null,
    browser: deviceInfo.browser || null,
  });

  // Update engagement summary
  await updateEngagementOnOpen(emailMessageId, message.toEmail);

  return true;
}

// ============================================
// ENGAGEMENT ANALYTICS
// ============================================

/**
 * Update engagement summary when an email is delivered
 */
export async function updateEngagementOnDelivery(emailMessageId: number, recipientEmail: string) {
  await db.upsertEngagementSummary(emailMessageId, {
    recipientEmail,
    delivered: true,
    deliveredAt: new Date(),
    engagementScore: 10, // Base score for delivery
  });
}

/**
 * Update engagement summary on open
 */
async function updateEngagementOnOpen(emailMessageId: number, recipientEmail: string) {
  const existing = await db.getEngagementSummary(emailMessageId);
  const now = new Date();
  const openCount = (existing?.openCount || 0) + 1;
  const engagementScore = Math.min(100, (existing?.engagementScore || 10) + (openCount === 1 ? 30 : 5));

  await db.upsertEngagementSummary(emailMessageId, {
    recipientEmail,
    opened: true,
    openCount,
    firstOpenedAt: existing?.firstOpenedAt || now,
    lastOpenedAt: now,
    engagementScore,
  });
}

/**
 * Update engagement summary on click
 */
async function updateEngagementOnClick(emailMessageId: number) {
  const existing = await db.getEngagementSummary(emailMessageId);
  const now = new Date();
  const clickCount = (existing?.clickCount || 0) + 1;

  // Get unique links clicked
  const links = await db.getEmailLinksForMessage(emailMessageId);
  const uniqueLinksClicked = links.filter(l => (l.clickCount || 0) > 0).length;

  const engagementScore = Math.min(100, (existing?.engagementScore || 10) + (clickCount === 1 ? 40 : 5));

  await db.upsertEngagementSummary(emailMessageId, {
    clicked: true,
    clickCount,
    firstClickedAt: existing?.firstClickedAt || now,
    lastClickedAt: now,
    uniqueLinksClicked,
    engagementScore,
  });
}

/**
 * Update engagement summary on bounce
 */
export async function updateEngagementOnBounce(
  emailMessageId: number,
  recipientEmail: string,
  bounceType: string
) {
  await db.upsertEngagementSummary(emailMessageId, {
    recipientEmail,
    bounced: true,
    bounceType,
    bouncedAt: new Date(),
    engagementScore: 0,
  });
}

/**
 * Update engagement summary on unsubscribe
 */
export async function updateEngagementOnUnsubscribe(emailMessageId: number, recipientEmail: string) {
  await db.upsertEngagementSummary(emailMessageId, {
    recipientEmail,
    unsubscribed: true,
    unsubscribedAt: new Date(),
    engagementScore: 0,
  });
}

/**
 * Update engagement summary on spam report
 */
export async function updateEngagementOnSpamReport(emailMessageId: number, recipientEmail: string) {
  await db.upsertEngagementSummary(emailMessageId, {
    recipientEmail,
    spamReported: true,
    spamReportedAt: new Date(),
    engagementScore: 0,
  });
}

/**
 * Get comprehensive engagement analytics for a date range
 */
export async function getEmailAnalytics(filters?: {
  startDate?: Date;
  endDate?: Date;
  relatedEntityType?: string;
}) {
  const stats = await db.getEngagementStats(filters);
  if (!stats) return null;

  const totalSent = Number(stats.totalSent) || 0;
  const totalDelivered = Number(stats.totalDelivered) || 0;
  const totalOpened = Number(stats.totalOpened) || 0;
  const totalClicked = Number(stats.totalClicked) || 0;
  const totalBounced = Number(stats.totalBounced) || 0;

  return {
    ...stats,
    deliveryRate: totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(2) : "0",
    openRate: totalDelivered > 0 ? ((totalOpened / totalDelivered) * 100).toFixed(2) : "0",
    clickRate: totalDelivered > 0 ? ((totalClicked / totalDelivered) * 100).toFixed(2) : "0",
    clickToOpenRate: totalOpened > 0 ? ((totalClicked / totalOpened) * 100).toFixed(2) : "0",
    bounceRate: totalSent > 0 ? ((totalBounced / totalSent) * 100).toFixed(2) : "0",
  };
}

/**
 * Get detailed tracking data for a single email message
 */
export async function getEmailTrackingDetail(emailMessageId: number) {
  const [message, engagement, events, links] = await Promise.all([
    db.getEmailMessageById(emailMessageId),
    db.getEngagementSummary(emailMessageId),
    db.getEmailTrackingEvents(emailMessageId),
    db.getEmailLinksForMessage(emailMessageId),
  ]);

  return {
    message,
    engagement,
    events,
    links,
  };
}

// ============================================
// BOUNCE MANAGEMENT
// ============================================

/**
 * Process a bounce event - classify and add to suppression list
 */
export async function processBounceEvent(
  email: string,
  bounceType: string,
  reason: string,
  emailMessageId?: number
) {
  // Classify bounce type
  const classification = classifyBounce(bounceType, reason);

  // Add to bounce list
  const now = new Date();
  await db.addToBounceList({
    email,
    bounceType: classification as any,
    reason,
    provider: "sendgrid",
    firstBouncedAt: now,
    lastBouncedAt: now,
  });

  // Update engagement if we have the message ID
  if (emailMessageId) {
    await updateEngagementOnBounce(emailMessageId, email, classification);
  }

  return { email, classification, reason };
}

/**
 * Classify a bounce as hard, soft, complaint, or unsubscribe
 */
function classifyBounce(bounceType: string, reason: string): string {
  const reasonLower = (reason || "").toLowerCase();
  const typeLower = (bounceType || "").toLowerCase();

  // Hard bounces - permanent delivery failure
  if (typeLower === "bounce" || typeLower === "blocked") {
    if (
      reasonLower.includes("invalid") ||
      reasonLower.includes("does not exist") ||
      reasonLower.includes("unknown user") ||
      reasonLower.includes("no such user") ||
      reasonLower.includes("mailbox not found") ||
      reasonLower.includes("permanently rejected") ||
      reasonLower.includes("550")
    ) {
      return "hard";
    }
  }

  // Complaints
  if (typeLower === "spamreport" || reasonLower.includes("spam") || reasonLower.includes("complaint")) {
    return "complaint";
  }

  // Unsubscribes
  if (typeLower === "unsubscribe" || typeLower === "group_unsubscribe") {
    return "unsubscribe";
  }

  // Default to soft bounce (temporary failure)
  return "soft";
}

/**
 * Check if an email should be suppressed before sending
 */
export async function checkSendEligibility(email: string): Promise<{
  canSend: boolean;
  reason?: string;
}> {
  const suppressed = await db.isEmailSuppressed(email);
  if (suppressed) {
    return { canSend: false, reason: "Email is on the suppression list (bounced/unsubscribed)" };
  }
  return { canSend: true };
}

/**
 * Get bounce list summary statistics
 */
export async function getBounceStats() {
  const [hardBounces, softBounces, complaints, unsubscribes] = await Promise.all([
    db.getBounceList({ bounceType: "hard" }),
    db.getBounceList({ bounceType: "soft" }),
    db.getBounceList({ bounceType: "complaint" }),
    db.getBounceList({ bounceType: "unsubscribe" }),
  ]);

  return {
    hard: hardBounces.length,
    soft: softBounces.length,
    complaints: complaints.length,
    unsubscribes: unsubscribes.length,
    totalSuppressed: hardBounces.length + softBounces.length + complaints.length + unsubscribes.length,
  };
}

// ============================================
// OUTBOUND EMAIL PREPARATION
// ============================================

/**
 * Prepare an HTML email body with tracking instrumentation.
 * Injects tracking pixel and rewrites links.
 */
export async function instrumentEmailHtml(
  html: string,
  emailMessageId: number
): Promise<string> {
  if (!html) return html;

  // 1. Rewrite links for click tracking
  let instrumented = await rewriteLinksForTracking(html, emailMessageId);

  // 2. Inject tracking pixel for open tracking
  instrumented = injectTrackingPixel(instrumented, emailMessageId);

  return instrumented;
}

// ============================================
// HELPERS
// ============================================

function generateTrackingToken(emailMessageId: number, type: string): string {
  const payload = `${type}:${emailMessageId}:${Date.now()}`;
  const hmac = crypto.createHmac("sha256", getTrackingSecret());
  hmac.update(payload);
  const sig = hmac.digest("hex").substring(0, 12);
  const encoded = Buffer.from(`${emailMessageId}:${sig}`).toString("base64url");
  return encoded;
}

function decodeTrackingToken(token: string, expectedType: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const parts = decoded.split(":");
    if (parts.length !== 2) return null;
    const emailMessageId = parseInt(parts[0], 10);
    if (isNaN(emailMessageId)) return null;
    return emailMessageId;
  } catch {
    return null;
  }
}

function generateLinkTrackingId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function getTrackingSecret(): string {
  return process.env.EMAIL_TRACKING_SECRET || process.env.SESSION_SECRET || "email-tracking-default-secret";
}

/**
 * Parse user agent string into device/browser/OS info
 */
function parseUserAgent(ua: string): {
  deviceType: string | null;
  os: string | null;
  browser: string | null;
} {
  if (!ua) return { deviceType: null, os: null, browser: null };

  const uaLower = ua.toLowerCase();

  // Device type
  let deviceType: string | null = null;
  if (uaLower.includes("mobile") || uaLower.includes("android") || uaLower.includes("iphone")) {
    deviceType = "mobile";
  } else if (uaLower.includes("tablet") || uaLower.includes("ipad")) {
    deviceType = "tablet";
  } else if (uaLower.includes("bot") || uaLower.includes("crawler") || uaLower.includes("spider")) {
    deviceType = "bot";
  } else {
    deviceType = "desktop";
  }

  // OS
  let os: string | null = null;
  if (uaLower.includes("windows")) os = "Windows";
  else if (uaLower.includes("mac os") || uaLower.includes("macos")) os = "macOS";
  else if (uaLower.includes("linux")) os = "Linux";
  else if (uaLower.includes("android")) os = "Android";
  else if (uaLower.includes("iphone") || uaLower.includes("ipad")) os = "iOS";

  // Browser
  let browser: string | null = null;
  if (uaLower.includes("chrome") && !uaLower.includes("edg")) browser = "Chrome";
  else if (uaLower.includes("firefox")) browser = "Firefox";
  else if (uaLower.includes("safari") && !uaLower.includes("chrome")) browser = "Safari";
  else if (uaLower.includes("edg")) browser = "Edge";
  else if (uaLower.includes("outlook")) browser = "Outlook";
  else if (uaLower.includes("thunderbird")) browser = "Thunderbird";

  return { deviceType, os, browser };
}
