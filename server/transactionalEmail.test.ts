import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the ENV module
vi.mock("./_core/env", () => ({
  ENV: {
    sendgridApiKey: "SG.test-key",
    sendgridFromEmail: "noreply@example.com",
    sendgridReplyTo: "support@example.com",
    sendgridWebhookSecret: "",
    publicAppUrl: "https://app.example.com",
    isProduction: false,
  },
  validateEmailConfig: () => ({ valid: true, errors: [] }),
  isTransactionalEmailReady: () => true,
}));

// Mock SendGrid
vi.mock("@sendgrid/mail", () => ({
  default: {
    setApiKey: vi.fn(),
    send: vi.fn(),
  },
}));

// Mock database functions
vi.mock("./db", () => ({
  createEmailMessage: vi.fn().mockResolvedValue({ id: 1 }),
  getEmailMessageById: vi.fn().mockResolvedValue({
    id: 1,
    toEmail: "recipient@example.com",
    toName: "Recipient",
    fromEmail: "noreply@example.com",
    fromName: "ERP System",
    subject: "Test Email",
    templateName: "GENERAL",
    payloadJson: { test: "data" },
    status: "queued",
    retryCount: 0,
    maxRetries: 3,
  }),
  getEmailMessageByIdempotencyKey: vi.fn().mockResolvedValue(null),
  getEmailMessageByProviderMessageId: vi.fn().mockResolvedValue(null),
  getTransactionalEmailTemplateByName: vi.fn().mockResolvedValue({
    id: 1,
    name: "GENERAL",
    providerTemplateId: "d-test-template-id",
    isActive: true,
  }),
  updateEmailMessageStatus: vi.fn().mockResolvedValue(undefined),
  updateEmailMessage: vi.fn().mockResolvedValue(undefined),
  incrementEmailMessageRetry: vi.fn().mockResolvedValue(undefined),
  createEmailEvent: vi.fn().mockResolvedValue({ id: 1 }),
  getQueuedEmailMessages: vi.fn().mockResolvedValue([]),
  getVendorQuoteById: vi.fn().mockResolvedValue(null),
  getPurchaseOrderById: vi.fn().mockResolvedValue(null),
  getVendorById: vi.fn().mockResolvedValue(null),
}));

import { ENV } from "./_core/env";
import sgMail from "@sendgrid/mail";
import * as emailService from "./_core/emailService";
import * as sendgridProvider from "./_core/sendgridProvider";
import * as db from "./db";

describe("Transactional Email Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("queueEmail", () => {
    it("should create an email message record", async () => {
      const result = await emailService.queueEmail({
        templateName: "GENERAL",
        to: { email: "test@example.com", name: "Test User" },
        subject: "Test Subject",
        payload: { key: "value" },
      });

      expect(result.success).toBe(true);
      expect(result.emailMessageId).toBe(1);
      expect(db.createEmailMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          toEmail: "test@example.com",
          toName: "Test User",
          subject: "Test Subject",
          templateName: "GENERAL",
        })
      );
    });

    it("should return existing message for duplicate idempotency key", async () => {
      (db.getEmailMessageByIdempotencyKey as any).mockResolvedValueOnce({
        id: 5,
        status: "sent",
      });

      const result = await emailService.queueEmail({
        templateName: "GENERAL",
        to: { email: "test@example.com" },
        subject: "Test",
        payload: {},
        idempotencyKey: "duplicate-key",
      });

      expect(result.success).toBe(true);
      expect(result.emailMessageId).toBe(5);
      expect(result.isDuplicate).toBe(true);
      expect(db.createEmailMessage).not.toHaveBeenCalled();
    });

    it("should set related entity info when provided", async () => {
      await emailService.queueEmail({
        templateName: "PO",
        to: { email: "vendor@example.com" },
        subject: "Purchase Order",
        payload: {},
        relatedEntityType: "purchase_order",
        relatedEntityId: 123,
        triggeredBy: 1,
      });

      expect(db.createEmailMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          relatedEntityType: "purchase_order",
          relatedEntityId: 123,
          triggeredBy: 1,
        })
      );
    });
  });

  describe("sendQueuedEmail", () => {
    it("should send email using template", async () => {
      (sgMail.send as any).mockResolvedValue([
        {
          statusCode: 202,
          headers: { "x-message-id": "provider-msg-id" },
        },
      ]);

      const result = await emailService.sendQueuedEmail(1);

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe("provider-msg-id");
      expect(db.updateEmailMessageStatus).toHaveBeenCalledWith(1, "sending");
      expect(db.updateEmailMessageStatus).toHaveBeenCalledWith(
        1,
        "sent",
        "provider-msg-id"
      );
    });

    it("should fail gracefully when template not found", async () => {
      (db.getTransactionalEmailTemplateByName as any).mockResolvedValueOnce(null);

      const result = await emailService.sendQueuedEmail(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Template");
      expect(result.shouldRetry).toBe(false);
    });

    it("should fail gracefully when template is inactive", async () => {
      (db.getTransactionalEmailTemplateByName as any).mockResolvedValueOnce({
        id: 1,
        name: "GENERAL",
        providerTemplateId: "d-test",
        isActive: false,
      });

      const result = await emailService.sendQueuedEmail(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not active");
      expect(result.shouldRetry).toBe(false);
    });

    it("should handle transient errors and retry", async () => {
      (sgMail.send as any).mockRejectedValue({
        response: { statusCode: 500 },
        message: "Server error",
      });

      const result = await emailService.sendQueuedEmail(1);

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(true);
      expect(db.incrementEmailMessageRetry).toHaveBeenCalled();
    });

    it("should not retry permanent errors", async () => {
      (sgMail.send as any).mockRejectedValue({
        response: {
          statusCode: 400,
          body: { errors: [{ message: "Invalid email" }] },
        },
      });

      const result = await emailService.sendQueuedEmail(1);

      expect(result.success).toBe(false);
      expect(result.shouldRetry).toBe(false);
    });

    it("should skip already sent messages", async () => {
      (db.getEmailMessageById as any).mockResolvedValueOnce({
        id: 1,
        status: "sent",
      });

      const result = await emailService.sendQueuedEmail(1);

      expect(result.success).toBe(false);
      expect(result.error).toContain("already processed");
    });
  });

  describe("getStatus", () => {
    it("should return service status", () => {
      const status = emailService.getStatus();

      expect(status.configured).toBe(true);
      expect(status.provider).toBe("sendgrid");
      expect(status.configDetails).toBeDefined();
    });
  });
});

describe("SendGrid Provider Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendWithTemplate", () => {
    it("should send email with dynamic template", async () => {
      (sgMail.send as any).mockResolvedValue([
        {
          statusCode: 202,
          headers: { "x-message-id": "msg-123" },
        },
      ]);

      const result = await sendgridProvider.sendWithTemplate({
        templateId: "d-template-id",
        to: { email: "test@example.com", name: "Test" },
        from: { email: "sender@example.com", name: "Sender" },
        subject: "Test Subject",
        dynamicTemplateData: { name: "John", company: "Acme" },
      });

      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe("msg-123");
      expect(sgMail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: "d-template-id",
          to: { email: "test@example.com", name: "Test" },
          dynamicTemplateData: { name: "John", company: "Acme" },
        })
      );
    });

    it("should handle rate limiting as transient error", async () => {
      (sgMail.send as any).mockRejectedValue({
        response: { statusCode: 429 },
        message: "Rate limited",
      });

      const result = await sendgridProvider.sendWithTemplate({
        templateId: "d-template-id",
        to: { email: "test@example.com" },
        from: { email: "sender@example.com" },
        dynamicTemplateData: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.isTransient).toBe(true);
    });

    it("should handle validation errors as permanent", async () => {
      (sgMail.send as any).mockRejectedValue({
        response: {
          statusCode: 400,
          body: { errors: [{ message: "Invalid email", code: "INVALID" }] },
        },
      });

      const result = await sendgridProvider.sendWithTemplate({
        templateId: "d-template-id",
        to: { email: "invalid" },
        from: { email: "sender@example.com" },
        dynamicTemplateData: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.isTransient).toBe(false);
      expect(result.error?.message).toBe("Invalid email");
    });
  });

  describe("mapEventToStatus", () => {
    it("should map delivered event to delivered status", () => {
      expect(sendgridProvider.mapEventToStatus("delivered")).toBe("delivered");
    });

    it("should map bounce event to bounced status", () => {
      expect(sendgridProvider.mapEventToStatus("bounce")).toBe("bounced");
    });

    it("should map dropped event to dropped status", () => {
      expect(sendgridProvider.mapEventToStatus("dropped")).toBe("dropped");
    });

    it("should return null for engagement events", () => {
      expect(sendgridProvider.mapEventToStatus("open")).toBeNull();
      expect(sendgridProvider.mapEventToStatus("click")).toBeNull();
    });
  });

  describe("isConfigured", () => {
    it("should return true when both API key and from email are set", () => {
      expect(sendgridProvider.isConfigured()).toBe(true);
    });
  });

  describe("getConfigStatus", () => {
    it("should return detailed config status", () => {
      const status = sendgridProvider.getConfigStatus();

      expect(status.configured).toBe(true);
      expect(status.hasApiKey).toBe(true);
      expect(status.hasFromEmail).toBe(true);
      expect(status.hasReplyTo).toBe(true);
    });
  });
});

describe("Webhook Event Processing", () => {
  describe("Event to Status Mapping", () => {
    const testCases = [
      { event: "delivered", expectedStatus: "delivered" },
      { event: "bounce", expectedStatus: "bounced" },
      { event: "blocked", expectedStatus: "bounced" },
      { event: "dropped", expectedStatus: "dropped" },
      { event: "deferred", expectedStatus: "deferred" },
      { event: "processed", expectedStatus: null },
      { event: "open", expectedStatus: null },
      { event: "click", expectedStatus: null },
    ];

    testCases.forEach(({ event, expectedStatus }) => {
      it(`should map "${event}" to "${expectedStatus}"`, () => {
        expect(sendgridProvider.mapEventToStatus(event)).toBe(expectedStatus);
      });
    });
  });
});

describe("Email Config Validation", () => {
  it("should pass when all required config is present", async () => {
    const { validateEmailConfig } = await import("./_core/env");
    const result = validateEmailConfig();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
