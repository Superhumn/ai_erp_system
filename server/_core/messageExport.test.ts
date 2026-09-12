import { afterEach, describe, expect, it, vi } from "vitest";

// exportEmails / exportMessages reach puppeteer via `await import("puppeteer")`
// only on the pdf path; csv and xlsx never touch it.
const launch = vi.fn();
vi.mock("puppeteer", () => ({ default: { launch: () => launch() } }));

import { exportEmails, exportMessages } from "./messageExport";

const emails = [
  { id: 1, subject: "Quote request", fromEmail: "a@example.com", bodyText: "hello" },
] as any[];

const messages = [
  { id: 1, channel: "whatsapp", direction: "inbound", content: "hi" },
] as any[];

describe("messageExport pdf path when the browser cannot launch", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("exportEmails throws instead of returning base64 HTML", async () => {
    launch.mockRejectedValue(new Error("Failed to launch the browser process"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(exportEmails(emails, "pdf", "inbox")).rejects.toThrow(/PDF export failed/);
  });

  it("exportMessages throws instead of returning base64 HTML", async () => {
    launch.mockRejectedValue(new Error("Failed to launch the browser process"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(exportMessages(messages, "pdf", "chat")).rejects.toThrow(/PDF export failed/);
  });

  it("keeps the launch failure as the cause and logs it", async () => {
    const underlying = new Error("no browser");
    launch.mockRejectedValue(underlying);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const error = await exportEmails(emails, "pdf", "inbox").catch((e) => e);
    expect((error as Error).message).toContain("no browser");
    expect((error as { cause?: unknown }).cause).toBe(underlying);
    expect(spy).toHaveBeenCalledWith("[messageExport] PDF generation failed:", underlying);
  });

  it("never resolves with data that is really HTML", async () => {
    launch.mockRejectedValue(new Error("no browser"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    // The regression: the catch used to return
    // Buffer.from(html).toString("base64") while the envelope still claimed
    // filename *.pdf and mimeType application/pdf.
    const settled = await exportEmails(emails, "pdf", "inbox").then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const }),
    );
    expect(settled.ok).toBe(false);
  });
});

describe("messageExport non-pdf formats are unaffected", () => {
  afterEach(() => vi.clearAllMocks());

  it("csv still succeeds while the browser is broken", async () => {
    launch.mockRejectedValue(new Error("no browser"));

    const r = await exportEmails(emails, "csv", "inbox");
    expect(r.mimeType).toBe("text/csv");
    expect(r.filename).toMatch(/\.csv$/);
    expect(launch).not.toHaveBeenCalled();
  });

  it("xlsx still succeeds while the browser is broken", async () => {
    launch.mockRejectedValue(new Error("no browser"));

    const r = await exportMessages(messages, "xlsx", "chat");
    expect(r.filename).toMatch(/\.xlsx$/);
    expect(r.encoding).toBe("base64");
    expect(launch).not.toHaveBeenCalled();
  });
});
