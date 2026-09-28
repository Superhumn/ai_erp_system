import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getVendorById: vi.fn(),
  getInvoices: vi.fn(),
}));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/emailService", () => ({}));

import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { generateVendorEmail } from "./vendorEmailAutomation";

describe("generateVendorEmail payment_reminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getVendorById).mockResolvedValue({ id: 3, name: "Acme Mills", contactName: "Pat" } as any);
    // Force the template fallback so the assembled context is observable
    vi.mocked(invokeLLM).mockRejectedValue(new Error("llm unavailable"));
  });

  it("never reads the customer `invoices` table (customerId is not a vendor id)", async () => {
    const result = await generateVendorEmail({
      vendorId: 3,
      emailType: "payment_reminder",
      customMessage: "Please confirm whether invoice INV-9 is still outstanding.",
    });

    expect(db.getInvoices).not.toHaveBeenCalled();
    expect(result.subject).toBe("Payment Status Update - Acme Mills");
    expect(result.body).toContain("INV-9");
    expect(result.body).not.toMatch(/Outstanding invoices:/);
  });

  it("falls back to a generic payment-status message when no custom message is given", async () => {
    const result = await generateVendorEmail({ vendorId: 3, emailType: "payment_reminder" });

    expect(db.getInvoices).not.toHaveBeenCalled();
    expect(result.body).toMatch(/outstanding invoices you have issued to us/);
  });
});
