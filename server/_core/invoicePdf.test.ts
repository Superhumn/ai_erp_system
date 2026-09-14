import { afterEach, describe, expect, it, vi } from "vitest";

// generateInvoicePdf resolves puppeteer through `await import('puppeteer')`, so
// the mock has to expose a `default` with `launch`.
const launch = vi.fn();
vi.mock("puppeteer", () => ({ default: { launch: () => launch() } }));

import { generateInvoiceHtml, generateInvoicePdf } from "./invoicePdf";

const company = { name: "Acme Ltd" };
const invoice = {
  invoiceNumber: "INV-1001",
  issueDate: "2026-01-15",
  customer: { name: "Wile E. Coyote" },
  items: [
    {
      description: "Rocket skates",
      quantity: "1",
      unitPrice: "100.00",
      totalAmount: "100.00",
    },
  ],
  subtotal: "100.00",
  totalAmount: "100.00",
};

describe("generateInvoicePdf when the browser cannot launch", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("throws instead of returning the HTML as a fake PDF", async () => {
    launch.mockRejectedValue(new Error("Failed to launch the browser process"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(generateInvoicePdf(invoice as any, company)).rejects.toThrow(
      /Invoice PDF generation failed/,
    );
  });

  it("keeps the underlying launch failure as the cause", async () => {
    const underlying = new Error("Failed to launch the browser process");
    launch.mockRejectedValue(underlying);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const error = await generateInvoicePdf(invoice as any, company).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Failed to launch the browser process");
    expect((error as { cause?: unknown }).cause).toBe(underlying);
  });

  it("does not resolve with a buffer containing the HTML", async () => {
    launch.mockRejectedValue(new Error("no browser"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    // The regression this guards: the catch block used to
    // `return Buffer.from(html, 'utf-8')`, which the router then base64-encoded
    // and served as application/pdf.
    const settled = await generateInvoicePdf(invoice as any, company).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    );
    expect(settled.ok).toBe(false);

    const html = generateInvoiceHtml(invoice as any, company);
    expect(html).toContain("INV-1001");
  });

  it("still logs the failure", async () => {
    launch.mockRejectedValue(new Error("no browser"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(generateInvoicePdf(invoice as any, company)).rejects.toThrow();
    expect(spy).toHaveBeenCalledWith("[InvoicePDF] PDF generation failed:", expect.any(Error));
  });
});
