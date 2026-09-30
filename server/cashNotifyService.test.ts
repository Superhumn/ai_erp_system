import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./webFetchGuard", () => ({ safePostJson: vi.fn(async () => ({ ok: true, status: 200, body: "ok" })) }));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn(async () => ({ success: true })), isEmailConfigured: vi.fn(() => true) }));
vi.mock("./_core/env", () => ({ ENV: { twilioAccountSid: "", twilioAuthToken: "", twilioWhatsappNumber: "" } }));

import * as guard from "./webFetchGuard";
import * as email from "./_core/email";
import { sendToChannel, validateChannelTarget } from "./cashNotifyService";

const msg = { title: "Cash digest", text: "Cash now: $5,000\n- In: A $1,000\nLow point: $4,000" };

beforeEach(() => vi.clearAllMocks());

describe("sendToChannel", () => {
  it("posts Slack mrkdwn through the fetch guard", async () => {
    const r = await sendToChannel({ type: "slack", target: "https://hooks.slack.com/services/T/B/x" }, msg);
    expect(r.ok).toBe(true);
    const [url, body] = vi.mocked(guard.safePostJson).mock.calls[0];
    expect(url).toContain("hooks.slack.com");
    expect((body as any).text).toBe("*Cash digest*\nCash now: $5,000\n- In: A $1,000\nLow point: $4,000");
  });
  it("posts Google Chat text and generic webhook JSON", async () => {
    await sendToChannel({ type: "google_chat", target: "https://chat.googleapis.com/v1/spaces/x" }, msg);
    await sendToChannel({ type: "webhook", target: "https://hooks.zapier.com/x" }, { ...msg, data: { lowestCash: 4000 } });
    const calls = vi.mocked(guard.safePostJson).mock.calls;
    expect((calls[0][1] as any).text).toContain("*Cash digest*");
    expect(calls[1][1]).toMatchObject({ title: "Cash digest", lowestCash: 4000 });
  });
  it("sends email with html bullets", async () => {
    const r = await sendToChannel({ type: "email", target: "a@b.co" }, msg);
    expect(r.ok).toBe(true);
    const arg = vi.mocked(email.sendEmail).mock.calls[0][0];
    expect(arg.subject).toBe("Cash digest");
    expect(arg.html).toContain("<li>In: A $1,000</li>");
  });
  it("reports a non-2xx webhook as a failure with the status", async () => {
    vi.mocked(guard.safePostJson).mockResolvedValueOnce({ ok: false, status: 404, body: "no_service" });
    const r = await sendToChannel({ type: "slack", target: "https://hooks.slack.com/services/T/B/x" }, msg);
    expect(r).toEqual({ ok: false, error: "Slack 404: no_service" });
  });
  it("fails cleanly when WhatsApp is not configured", async () => {
    const r = await sendToChannel({ type: "whatsapp", target: "+14155551234" }, msg);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/TWILIO_WHATSAPP_NUMBER/);
  });
});

describe("validateChannelTarget", () => {
  it("accepts good targets and rejects bad ones", () => {
    expect(validateChannelTarget("slack", "https://hooks.slack.com/services/T/B/x")).toBeNull();
    expect(validateChannelTarget("slack", "https://example.com")).toMatch(/incoming webhook/);
    expect(validateChannelTarget("google_chat", "https://chat.googleapis.com/v1/spaces/AAA/messages?key=1")).toBeNull();
    expect(validateChannelTarget("whatsapp", "+1 415 555 1234")).toBeNull();
    expect(validateChannelTarget("whatsapp", "hello")).toMatch(/country code/);
    expect(validateChannelTarget("email", "jade@superhumn.co")).toBeNull();
    expect(validateChannelTarget("webhook", "http://insecure")).toMatch(/https/);
  });
});
