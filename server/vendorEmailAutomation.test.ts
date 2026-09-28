import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getVendorById: vi.fn(),
  getInvoices: vi.fn(),
  getOpenBillsForVendor: vi.fn().mockResolvedValue([]),
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
    vi.mocked(db.getOpenBillsForVendor).mockResolvedValue([] as any);
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

  it("lists the vendor's open bills with number, due date and outstanding amount", async () => {
    vi.mocked(db.getOpenBillsForVendor).mockResolvedValue([
      { id: 1, billNumber: "B-100", totalAmount: "250.00", amountPaid: "50.00", dueDate: new Date("2026-10-05T12:00:00Z"), currency: "USD", status: "approved" },
      { id: 2, billNumber: "B-101", totalAmount: "80.00", amountPaid: "0.00", dueDate: null, currency: "USD", status: "overdue" },
    ] as any);

    const result = await generateVendorEmail({ vendorId: 3, emailType: "payment_reminder", customMessage: "Thanks for your patience." });

    expect(db.getOpenBillsForVendor).toHaveBeenCalledWith(3);
    expect(db.getInvoices).not.toHaveBeenCalled();
    expect(result.subject).toBe("Payment Status Update - Acme Mills");
    expect(result.body).toContain("Outstanding bills");
    expect(result.body).toContain("Bill B-100: outstanding $200.00");
    expect(result.body).toContain(new Date("2026-10-05T12:00:00Z").toLocaleDateString());
    expect(result.body).toContain("Bill B-101: outstanding $80.00");
    expect(result.body).toContain("no due date");
    expect(result.body).toContain("total $280.00");
    expect(result.body).toContain("Thanks for your patience.");
  });
});
