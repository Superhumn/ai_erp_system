import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// appRouter.offerLetters.{preview,send,resend} — email the offer, then mark it
// sent. db and the mailer are mocked at module level.
const letterRow = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  companyId: null as number | null,
  stakeholderId: null,
  employeeId: null,
  candidateName: "Dana Employee",
  candidateEmail: "dana@example.com" as string | null,
  position: "Operations Analyst",
  department: "Operations",
  startDate: new Date("2026-10-01"),
  salary: "85000.00",
  salaryPeriod: "annual",
  bonus: null,
  equityShares: null,
  equityType: null,
  vestingMonths: null,
  cliffMonths: null,
  benefits: "Health & dental",
  reportingTo: "Morgan Manager",
  location: "Remote",
  employmentType: "full_time",
  letterContent: null,
  status: "draft",
  sentAt: null,
  viewedAt: null,
  respondedAt: null,
  expiresAt: null as Date | null,
  signatureUrl: null,
  notes: "internal: floor is 80k",
  createdBy: 1,
  createdAt: new Date("2026-09-01"),
  updatedAt: new Date("2026-09-01"),
  ...overrides,
});

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  getCompanyById: vi.fn().mockResolvedValue(undefined),
  getOfferLetterById: vi.fn(),
  updateOfferLetter: vi.fn(async (id: number, data: Record<string, unknown>) => ({ id, ...data })),
}));

vi.mock("./_core/email", () => ({
  sendEmail: vi.fn(),
  isEmailConfigured: vi.fn().mockReturnValue(true),
}));

import * as db from "./db";
import { sendEmail } from "./_core/email";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxFor(user: Partial<AuthenticatedUser> | null = {}): TrpcContext {
  return {
    user:
      user === null
        ? null
        : ({
            id: 1,
            openId: "u",
            email: "hr@example.com",
            name: "Harper HR",
            loginMethod: "manus",
            role: "admin",
            companyId: 1,
            regionScope: "global",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
            ...user,
          } as AuthenticatedUser),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const caller = (user: Partial<AuthenticatedUser> | null = {}) => appRouter.createCaller(ctxFor(user));

describe("offerLetters email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getOfferLetterById).mockResolvedValue(letterRow() as never);
    vi.mocked(db.getCompanyById).mockResolvedValue(undefined);
    vi.mocked(sendEmail).mockResolvedValue({ success: true, messageId: "msg-1" });
  });

  describe("send", () => {
    it("emails the rendered offer to the candidate, then marks it sent and audits", async () => {
      const res = await caller().offerLetters.send({ id: 7, message: "Welcome aboard!" });

      expect(sendEmail).toHaveBeenCalledTimes(1);
      const mail = vi.mocked(sendEmail).mock.calls[0][0];
      expect(mail.to).toBe("dana@example.com");
      expect(mail.replyTo).toBe("hr@example.com");
      expect(mail.subject).toBe("Offer of employment: Operations Analyst");
      expect(mail.text).toContain("Compensation: $85,000 per year");
      expect(mail.text).toContain("Start date: October 1, 2026");
      expect(mail.text).toContain("Welcome aboard!");
      expect(mail.html).toContain("Health &amp; dental");
      expect(mail.html).not.toContain("floor is 80k");

      expect(db.updateOfferLetter).toHaveBeenCalledTimes(1);
      const [id, patch] = vi.mocked(db.updateOfferLetter).mock.calls[0];
      expect(id).toBe(7);
      expect(patch).toMatchObject({ status: "sent" });
      expect(patch.sentAt).toBeInstanceOf(Date);
      expect(patch).not.toHaveProperty("candidateEmail");

      // Status is written only after the provider accepted the message.
      expect(vi.mocked(sendEmail).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(db.updateOfferLetter).mock.invocationCallOrder[0]);

      expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        userId: 1, action: "update", entityType: "offer_letter", entityId: 7, entityName: "Dana Employee",
        oldValues: { status: "draft" },
        newValues: expect.objectContaining({ status: "sent", emailedTo: "dana@example.com", action: "send", messageId: "msg-1" }),
      }));
      expect(res).toMatchObject({ success: true, id: 7, status: "sent", to: "dana@example.com", cc: [], ccFailed: [], messageId: "msg-1" });
    });

    it("uses the company's name and currency when the letter has one", async () => {
      vi.mocked(db.getOfferLetterById).mockResolvedValue(letterRow({ companyId: 3 }) as never);
      vi.mocked(db.getCompanyById).mockResolvedValue({ id: 3, name: "Superhumn GmbH", functionalCurrency: "EUR", locale: "en-US" } as never);
      await caller().offerLetters.send({ id: 7 });
      const mail = vi.mocked(sendEmail).mock.calls[0][0];
      expect(db.getCompanyById).toHaveBeenCalledWith(3);
      expect(mail.subject).toBe("Offer of employment: Operations Analyst at Superhumn GmbH");
      expect(mail.text).toContain("€85,000 per year");
    });

    it("sends to an explicit `to` and stores it when the letter had no email", async () => {
      vi.mocked(db.getOfferLetterById).mockResolvedValue(letterRow({ candidateEmail: null }) as never);
      await caller().offerLetters.send({ id: 7, to: "dana.personal@example.com" });
      expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("dana.personal@example.com");
      expect(vi.mocked(db.updateOfferLetter).mock.calls[0][1]).toMatchObject({ status: "sent", candidateEmail: "dana.personal@example.com" });
    });

    it("sends a copy to each cc address and reports failed copies without undoing the send", async () => {
      vi.mocked(sendEmail)
        .mockResolvedValueOnce({ success: true, messageId: "msg-1" })
        .mockResolvedValueOnce({ success: true, messageId: "msg-2" })
        .mockResolvedValueOnce({ success: false, error: "bounced" });
      const res = await caller().offerLetters.send({ id: 7, cc: ["manager@example.com", "DANA@example.com", "hr-lead@example.com"] });
      expect(vi.mocked(sendEmail).mock.calls.map((c) => c[0].to)).toEqual(["dana@example.com", "manager@example.com", "hr-lead@example.com"]);
      expect(res).toMatchObject({ status: "sent", cc: ["manager@example.com", "hr-lead@example.com"], ccFailed: ["hr-lead@example.com"] });
      expect(db.updateOfferLetter).toHaveBeenCalledTimes(1);
    });

    it("refuses without a candidate email or `to`", async () => {
      vi.mocked(db.getOfferLetterById).mockResolvedValue(letterRow({ candidateEmail: "  " }) as never);
      await expect(caller().offerLetters.send({ id: 7 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(db.updateOfferLetter).not.toHaveBeenCalled();
    });

    it("refuses a stored candidate email that is not an address", async () => {
      vi.mocked(db.getOfferLetterById).mockResolvedValue(letterRow({ candidateEmail: "dana at example" }) as never);
      await expect(caller().offerLetters.send({ id: 7 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("rejects an invalid `to` at input validation", async () => {
      await expect(caller().offerLetters.send({ id: 7, to: "not-an-email" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it.each(["accepted", "declined", "withdrawn", "expired"])("refuses a %s letter with PRECONDITION_FAILED", async (status) => {
      vi.mocked(db.getOfferLetterById).mockResolvedValue(letterRow({ status }) as never);
      await expect(caller().offerLetters.send({ id: 7 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(db.updateOfferLetter).not.toHaveBeenCalled();
      expect(db.createAuditLog).not.toHaveBeenCalled();
    });

    it("refuses a letter whose response deadline has passed", async () => {
      vi.mocked(db.getOfferLetterById).mockResolvedValue(letterRow({ expiresAt: new Date(Date.now() - 86_400_000) }) as never);
      await expect(caller().offerLetters.send({ id: 7 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("returns NOT_FOUND for a missing letter", async () => {
      vi.mocked(db.getOfferLetterById).mockResolvedValue(undefined);
      await expect(caller().offerLetters.send({ id: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("does not flip status or audit when the mailer reports failure", async () => {
      vi.mocked(sendEmail).mockResolvedValue({ success: false, error: "SendGrid API key not configured" });
      await expect(caller().offerLetters.send({ id: 7 })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: expect.stringContaining("SendGrid API key not configured"),
      });
      expect(db.updateOfferLetter).not.toHaveBeenCalled();
      expect(db.createAuditLog).not.toHaveBeenCalled();
    });

    it("does not flip status when the mailer throws", async () => {
      vi.mocked(sendEmail).mockRejectedValue(new Error("socket hang up"));
      await expect(caller().offerLetters.send({ id: 7 })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: expect.stringContaining("socket hang up"),
      });
      expect(db.updateOfferLetter).not.toHaveBeenCalled();
    });

    it("requires an authenticated user (same guard as create)", async () => {
      await expect(caller(null).offerLetters.send({ id: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(caller(null).offerLetters.preview({ id: 7 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(caller(null).offerLetters.create({ candidateName: "X", position: "Y" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("keeps a viewed letter viewed when it is sent again", async () => {
      vi.mocked(db.getOfferLetterById).mockResolvedValue(letterRow({ status: "viewed" }) as never);
      const res = await caller().offerLetters.send({ id: 7 });
      expect(res.status).toBe("viewed");
      expect(vi.mocked(db.updateOfferLetter).mock.calls[0][1]).toMatchObject({ status: "viewed" });
    });
  });

  describe("resend", () => {
    it("re-sends an already-sent offer and refreshes sentAt", async () => {
      vi.mocked(db.getOfferLetterById).mockResolvedValue(letterRow({ status: "sent", sentAt: new Date("2026-09-01") }) as never);
      const res = await caller().offerLetters.resend({ id: 7 });
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(res.status).toBe("sent");
      expect(res.sentAt.getTime()).toBeGreaterThan(new Date("2026-09-01").getTime());
      expect(db.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ action: "resend" }) }));
    });

    it("refuses a draft (use send)", async () => {
      await expect(caller().offerLetters.resend({ id: 7 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("preview", () => {
    it("returns exactly what send would mail, without sending or writing", async () => {
      const preview = await caller().offerLetters.preview({ id: 7, message: "Welcome aboard!" });
      expect(preview.to).toBe("dana@example.com");
      expect(preview.status).toBe("draft");
      expect(preview.subject).toBe("Offer of employment: Operations Analyst");
      expect(preview.text).toContain("Welcome aboard!");
      expect(preview.text).toContain("Sincerely,\nHarper HR");
      expect(sendEmail).not.toHaveBeenCalled();
      expect(db.updateOfferLetter).not.toHaveBeenCalled();

      await caller().offerLetters.send({ id: 7, message: "Welcome aboard!" });
      const mail = vi.mocked(sendEmail).mock.calls[0][0];
      expect({ subject: mail.subject, html: mail.html, text: mail.text }).toEqual({ subject: preview.subject, html: preview.html, text: preview.text });
    });

    it("returns NOT_FOUND for a missing letter", async () => {
      vi.mocked(db.getOfferLetterById).mockResolvedValue(undefined);
      await expect(caller().offerLetters.preview({ id: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});

describe("offerLetters external-role gating", () => {
  it("refuses vendor, copacker, investor and contractor accounts on every procedure", async () => {
    for (const role of ["vendor", "copacker", "investor", "contractor"] as const) {
      const caller = appRouter.createCaller(ctxFor({ role }));
      await expect(caller.offerLetters.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.offerLetters.send({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.offerLetters.preview({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
