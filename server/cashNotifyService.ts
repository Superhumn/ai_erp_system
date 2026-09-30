/**
 * Cash forecast messaging: one message, many destinations. Slack and Google
 * Chat take an incoming-webhook URL, WhatsApp goes through Twilio, email
 * through SendGrid, and "webhook" posts the raw JSON to anything else
 * (Zapier, Teams via a connector, a custom endpoint).
 */
import { ENV } from "./_core/env";
import { isEmailConfigured, sendEmail } from "./_core/email";
import { safePostJson } from "./webFetchGuard";

export type ChannelType = "slack" | "google_chat" | "whatsapp" | "email" | "webhook";

export interface OutboundMessage {
  /** One line, used as the email subject and the first bold line elsewhere. */
  title: string;
  /** Plain-text body. Lines starting with "- " render as bullets where supported. */
  text: string;
  /** Structured copy of the message for the generic webhook. */
  data?: Record<string, unknown>;
}

export interface ChannelTarget {
  type: ChannelType;
  target: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

const MAX_WHATSAPP = 1500;

function toSlackMrkdwn(m: OutboundMessage): string {
  return `*${m.title}*\n${m.text}`;
}

function toGoogleChatText(m: OutboundMessage): string {
  return `*${m.title}*\n${m.text}`;
}

function toHtml(m: OutboundMessage): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const lines = m.text.split("\n");
  const out: string[] = [`<h3 style="margin:0 0 8px;font-family:system-ui,sans-serif">${esc(m.title)}</h3>`];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul style=\"margin:4px 0 8px 18px;padding:0;font-family:system-ui,sans-serif;font-size:14px\">");
        inList = true;
      }
      out.push(`<li>${esc(line.slice(2))}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    out.push(line === "" ? "<br/>" : `<p style="margin:0 0 4px;font-family:system-ui,sans-serif;font-size:14px">${esc(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

export async function sendToChannel(channel: ChannelTarget, message: OutboundMessage): Promise<SendResult> {
  try {
    switch (channel.type) {
      case "slack": {
        const res = await safePostJson(channel.target, { text: toSlackMrkdwn(message) });
        return res.ok ? { ok: true } : { ok: false, error: `Slack ${res.status}: ${res.body.slice(0, 200)}` };
      }
      case "google_chat": {
        const res = await safePostJson(channel.target, { text: toGoogleChatText(message) });
        return res.ok ? { ok: true } : { ok: false, error: `Google Chat ${res.status}: ${res.body.slice(0, 200)}` };
      }
      case "webhook": {
        const res = await safePostJson(channel.target, { title: message.title, text: message.text, ...(message.data ?? {}) });
        return res.ok ? { ok: true } : { ok: false, error: `Webhook ${res.status}: ${res.body.slice(0, 200)}` };
      }
      case "email": {
        if (!isEmailConfigured()) return { ok: false, error: "Email is not configured (SENDGRID_API_KEY)" };
        const res = await sendEmail({ to: channel.target, subject: message.title, text: `${message.title}\n\n${message.text}`, html: toHtml(message) });
        return res.success ? { ok: true } : { ok: false, error: res.error ?? "Email send failed" };
      }
      case "whatsapp": {
        if (!ENV.twilioAccountSid || !ENV.twilioAuthToken || !ENV.twilioWhatsappNumber) {
          return { ok: false, error: "WhatsApp is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_NUMBER)" };
        }
        const { default: twilio } = await import("twilio");
        const client = twilio(ENV.twilioAccountSid, ENV.twilioAuthToken);
        const withPrefix = (n: string) => (n.startsWith("whatsapp:") ? n : `whatsapp:${n.startsWith("+") ? n : `+${n}`}`);
        const body = `*${message.title}*\n${message.text}`.slice(0, MAX_WHATSAPP);
        await client.messages.create({ to: withPrefix(channel.target), from: withPrefix(ENV.twilioWhatsappNumber), body });
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown channel type ${String((channel as any).type)}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Basic shape check before saving a destination, so a typo fails at save time rather than Monday morning. */
export function validateChannelTarget(type: ChannelType, target: string): string | null {
  const t = target.trim();
  if (!t) return "Destination is required";
  switch (type) {
    case "slack":
      return /^https:\/\/hooks\.slack\.com\/(services|workflows)\/\S+$/.test(t) ? null : "Slack needs an incoming webhook URL (https://hooks.slack.com/services/…)";
    case "google_chat":
      return /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/\S+/.test(t) ? null : "Google Chat needs a space webhook URL (https://chat.googleapis.com/v1/spaces/…)";
    case "webhook":
      return /^https:\/\/\S+$/.test(t) ? null : "Webhook must be an https:// URL";
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? null : "Enter a valid email address";
    case "whatsapp":
      return /^\+?[1-9]\d{6,14}$/.test(t.replace(/[\s-]/g, "")) ? null : "WhatsApp needs a phone number with country code (e.g. +14155551234)";
    default:
      return "Unknown channel";
  }
}
