import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers/index";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import * as emailParser from "./_core/emailParser";
import * as inboxScanner from "./_core/emailInboxScanner";
import * as documentImport from "./documentImportService";
import * as linker from "./emailDocumentLinker";
import * as storage from "./storage";

vi.mock("./_core/emailParser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_core/emailParser")>()),
  parseEmailContent: vi.fn(),
}));
vi.mock("./emailDocumentLinker", () => ({
  linkParsedEmailToEntities: vi.fn().mockResolvedValue({}),
}));
vi.mock("./_core/emailInboxScanner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_core/emailInboxScanner")>()),
  getImapConfig: vi.fn(),
  scanAndCategorizeInbox: vi.fn(),
}));
vi.mock("./documentImportService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./documentImportService")>()),
  importEmailAttachmentToErp: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("./storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage")>()),
  storagePut: vi.fn().mockResolvedValue({ key: "k", url: "u" }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxFor(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "scan-user",
    email: "ops@example.com",
    name: "Ops User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/** Stub every db call submitEmail makes before it reaches the automations. */
function stubSubmitEmailPipeline() {
  // vi.restoreAllMocks() (Vitest 2) also clears the resolved values on the
  // vi.fn()s declared in the vi.mock factories above, so re-arm them here.
  vi.mocked(linker.linkParsedEmailToEntities).mockResolvedValue({} as any);
  vi.spyOn(db, "createInboundEmail").mockResolvedValue({ id: 501 } as any);
  vi.spyOn(db, "findVendorByEmailOrName").mockResolvedValue(null as any);
  vi.spyOn(db, "findPurchaseOrderByNumber").mockResolvedValue(null as any);
  vi.spyOn(db, "findShipmentByTracking").mockResolvedValue(null as any);
  vi.spyOn(db, "createParsedDocument").mockResolvedValue({ id: 601 } as any);
  vi.spyOn(db, "createParsedDocumentLineItem").mockResolvedValue({ id: 701 } as any);
  vi.spyOn(db, "updateEmailCategorization").mockResolvedValue(undefined as any);
  vi.spyOn(db, "updateInboundEmailStatus").mockResolvedValue(undefined as any);
  vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined as any);
}

const baseInput = {
  fromEmail: "billing@acme.test",
  fromName: "Acme Billing",
  subject: "Invoice INV-1001",
  bodyText: "Please find attached invoice INV-1001 for $100.",
};

describe("emailScanning.submitEmail automations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("auto-creates the draft as a real `invoice` row with the vendor in notes (no bill/customerId)", async () => {
    stubSubmitEmailPipeline();
    vi.mocked(emailParser.parseEmailContent).mockResolvedValue({
      success: true,
      documents: [{
        documentType: "invoice",
        confidence: 90,
        vendorName: "Acme Corp",
        vendorEmail: "billing@acme.test",
        documentNumber: "INV-1001",
        totalAmount: 100,
        subtotal: 90,
        taxAmount: 10,
        lineItems: [{ description: "Widget", quantity: 2, unitPrice: 45, totalPrice: 90 }],
      }],
      categorization: { category: "invoice", confidence: 95, keywords: [], priority: "medium" },
    } as any);
    vi.spyOn(db, "findVendorByEmailOrName").mockResolvedValue({ id: 4, name: "Acme Corp" } as any);
    vi.spyOn(db, "getInvoiceByNumber").mockResolvedValue(null as any);
    const createInvoice = vi.spyOn(db, "createInvoice").mockResolvedValue({ id: 77 } as any);
    const createInvoiceItem = vi.spyOn(db, "createInvoiceItem").mockResolvedValue({ id: 78 } as any);

    const caller = appRouter.createCaller(ctxFor());
    const result = await caller.emailScanning.submitEmail(baseInput);
    expect(result.success).toBe(true);

    expect(createInvoice).toHaveBeenCalledTimes(1);
    const row = createInvoice.mock.calls[0][0] as Record<string, unknown>;
    // invoices.type enum is invoice | credit_note | quote — "bill" was rejected by MySQL.
    expect(row.type).toBe("invoice");
    // customerId is an FK to customers; a vendor id there fails the constraint.
    expect(row).not.toHaveProperty("customerId");
    expect(row.invoiceNumber).toBe("INV-1001");
    expect(row.status).toBe("draft");
    expect(row.totalAmount).toBe("100");
    expect(String(row.notes)).toContain("Acme Corp");
    expect(String(row.notes)).toContain("vendor id 4");
    expect(createInvoiceItem).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 77, description: "Widget" }));
  });

  it("looks up open RFQs by status 'sent' and skips the quote when nothing matches (no rfqId 0 rows)", async () => {
    stubSubmitEmailPipeline();
    vi.mocked(emailParser.parseEmailContent).mockResolvedValue({
      success: true,
      documents: [{ documentType: "quote", confidence: 80, documentNumber: "Q-1", totalAmount: 500 }],
      categorization: { category: "freight_quote", confidence: 90, keywords: [], priority: "medium" },
    } as any);
    vi.spyOn(db, "getFreightCarriers").mockResolvedValue([] as any);
    const getFreightRfqs = vi.spyOn(db, "getFreightRfqs").mockResolvedValue([] as any);
    const createFreightQuote = vi.spyOn(db, "createFreightQuote").mockResolvedValue({ id: 1 } as any);
    const updateFreightRfq = vi.spyOn(db, "updateFreightRfq").mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(ctxFor());
    const result = await caller.emailScanning.submitEmail({ ...baseInput, fromEmail: "quotes@carrier.test" });
    expect(result.success).toBe(true);

    // rfqs.sendToCarriers sets "sent"; nothing ever writes "awaiting_quotes".
    expect(getFreightRfqs).toHaveBeenCalledWith({ status: "sent" });
    expect(createFreightQuote).not.toHaveBeenCalled();
    expect(updateFreightRfq).not.toHaveBeenCalled();
  });

  it("attaches the quote to the matched carrier and the open RFQ when both exist", async () => {
    stubSubmitEmailPipeline();
    vi.mocked(emailParser.parseEmailContent).mockResolvedValue({
      success: true,
      documents: [{ documentType: "quote", confidence: 80, documentNumber: "Q-2", totalAmount: 500 }],
      categorization: { category: "freight_quote", confidence: 90, keywords: [], priority: "medium" },
    } as any);
    vi.spyOn(db, "getFreightCarriers").mockResolvedValue([{ id: 3, name: "Fast Freight", email: "Quotes@Carrier.test" }] as any);
    vi.spyOn(db, "getFreightRfqs").mockResolvedValue([{ id: 9, status: "sent" }] as any);
    const createFreightQuote = vi.spyOn(db, "createFreightQuote").mockResolvedValue({ id: 1 } as any);
    const updateFreightRfq = vi.spyOn(db, "updateFreightRfq").mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(ctxFor());
    await caller.emailScanning.submitEmail({ ...baseInput, fromEmail: "quotes@carrier.test" });

    expect(createFreightQuote).toHaveBeenCalledWith(expect.objectContaining({ rfqId: 9, carrierId: 3, quoteNumber: "Q-2" }));
    expect(updateFreightRfq).toHaveBeenCalledWith(9, { status: "quotes_received" });
  });
});

describe("emailScanning.scanNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("stores the email as parsingStatus=parsed and imports attachments as the calling user", async () => {
    // Re-arm the factory mocks cleared by vi.restoreAllMocks() (see stubSubmitEmailPipeline).
    vi.mocked(storage.storagePut).mockResolvedValue({ key: "k", url: "u" } as any);
    vi.mocked(documentImport.importEmailAttachmentToErp).mockResolvedValue({ success: true } as any);
    vi.mocked(inboxScanner.getImapConfig).mockReturnValue({ host: "imap.test", port: 993, secure: true, user: "u", password: "p" } as any);
    vi.mocked(inboxScanner.scanAndCategorizeInbox).mockResolvedValue({
      parsedResults: [{
        email: {
          messageId: "<m1@test>",
          from: { address: "billing@acme.test", name: "Acme" },
          to: ["inbox@erp.test"],
          subject: "Invoice",
          bodyText: "body",
          date: new Date("2026-09-01T00:00:00Z"),
          categorization: { category: "invoice", confidence: 90, keywords: [], priority: "medium" },
          attachmentContents: [{ filename: "inv.pdf", contentType: "application/pdf", data: Buffer.from("pdf") }],
        },
      }],
    } as any);
    const createInboundEmail = vi.spyOn(db, "createInboundEmail").mockResolvedValue({ id: 900 } as any);
    vi.spyOn(db, "getEmailAttachments").mockResolvedValue([] as any);
    vi.spyOn(db, "createEmailAttachment").mockResolvedValue({ id: 31 } as any);
    vi.spyOn(db, "updateEmailAttachment").mockResolvedValue(undefined as any);

    const caller = appRouter.createCaller(ctxFor({ id: 42 }));
    const result = await caller.emailScanning.scanNow({ folders: ["INBOX"] });
    expect(result.emailsProcessed).toBe(1);

    const row = createInboundEmail.mock.calls[0][0] as Record<string, unknown>;
    // The column is parsingStatus; a stray `status` key was dropped and the row stayed "pending".
    expect(row.parsingStatus).toBe("parsed");
    expect(row.parsedAt).toBeInstanceOf(Date);
    expect(row).not.toHaveProperty("status");

    expect(documentImport.importEmailAttachmentToErp).toHaveBeenCalledWith(
      expect.objectContaining({ emailId: 900, attachmentId: 31, userId: 42 }),
    );
    expect(result.attachmentsParsed).toBe(1);
  });
});
