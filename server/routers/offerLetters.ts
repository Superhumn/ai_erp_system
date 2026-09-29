// appRouter.offerLetters — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { sendEmail } from "../_core/email";
import * as db from "../db";
import { renderOfferLetterEmail, type OfferLetterEmailCompany } from "../offerLetterEmail";
import { createAuditLog, internalProcedure } from "./_shared";

/** Statuses an offer can no longer be (re)sent from. */
const UNSENDABLE_STATUSES = new Set(["accepted", "declined", "withdrawn", "expired"]);

type OfferLetterRow = NonNullable<Awaited<ReturnType<typeof db.getOfferLetterById>>>;

async function loadOfferLetter(id: number): Promise<OfferLetterRow> {
  const letter = await db.getOfferLetterById(id);
  if (!letter) throw new TRPCError({ code: "NOT_FOUND", message: "Offer letter not found" });
  return letter;
}

/** The issuing company is cosmetic (name, currency); never fail a send over it. */
async function loadCompany(companyId: number | null): Promise<OfferLetterEmailCompany | null> {
  if (!companyId) return null;
  try {
    return (await db.getCompanyById(companyId)) ?? null;
  } catch {
    return null;
  }
}

const sendInput = z.object({
  id: z.number(),
  to: z.string().trim().email().optional(),
  cc: z.array(z.string().trim().email()).max(10).optional(),
  message: z.string().max(5000).optional(),
});

async function sendOfferLetter(
  input: z.infer<typeof sendInput>,
  user: { id: number; name: string | null; email: string | null },
  mode: "send" | "resend",
) {
  const letter = await loadOfferLetter(input.id);
  const status = letter.status ?? "draft";
  if (UNSENDABLE_STATUSES.has(status)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Offer letter is ${status} and can no longer be sent` });
  }
  if (mode === "resend" && status !== "sent" && status !== "viewed") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only an offer that was already sent can be resent" });
  }
  if (letter.expiresAt && new Date(letter.expiresAt).getTime() < Date.now()) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The offer's response deadline has passed; update the expiry date before sending" });
  }

  const storedEmail = letter.candidateEmail?.trim() || undefined;
  const to = input.to ?? storedEmail;
  if (!to) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The offer letter has no candidate email; provide a recipient" });
  }
  if (!input.to && !z.string().email().safeParse(to).success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Candidate email "${to}" is not a valid address; provide a recipient` });
  }

  const company = await loadCompany(letter.companyId);
  const rendered = renderOfferLetterEmail(letter, company, { message: input.message, senderName: user.name });
  const replyTo = user.email ?? undefined;

  let result: Awaited<ReturnType<typeof sendEmail>>;
  try {
    result = await sendEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text, replyTo });
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!result.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Offer letter email was not sent: ${result.error ?? "unknown error"}`,
    });
  }

  // sendEmail takes a single recipient, so each cc gets its own copy. A failed
  // copy does not undo the send; it is reported back to the caller.
  const cc = Array.from(new Set((input.cc ?? []).map((a) => a.toLowerCase()))).filter((a) => a !== to.toLowerCase());
  const ccFailed: string[] = [];
  for (const address of cc) {
    try {
      const copy = await sendEmail({ to: address, subject: rendered.subject, html: rendered.html, text: rendered.text, replyTo });
      if (!copy.success) ccFailed.push(address);
    } catch {
      ccFailed.push(address);
    }
  }

  const sentAt = new Date();
  // A resend to a candidate who has already opened the offer keeps "viewed".
  const nextStatus = status === "viewed" ? "viewed" : "sent";
  await db.updateOfferLetter(letter.id, {
    status: nextStatus,
    sentAt,
    ...(storedEmail ? {} : { candidateEmail: to }),
  });
  await createAuditLog(
    user.id,
    "update",
    "offer_letter",
    letter.id,
    letter.candidateName,
    { status },
    { status: nextStatus, sentAt: sentAt.toISOString(), emailedTo: to, cc, action: mode, messageId: result.messageId ?? null },
  );

  return { success: true as const, id: letter.id, status: nextStatus, sentAt, to, cc, ccFailed, messageId: result.messageId ?? null };
}

// ============================================
// OFFER LETTERS
// ============================================
export const offerLettersRouter = router({
    list: internalProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getOfferLetters(input)),

    get: internalProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getOfferLetterById(input.id)),

    create: internalProcedure
      .input(z.object({
        companyId: z.number().optional(),
        stakeholderId: z.number().optional(),
        employeeId: z.number().optional(),
        candidateName: z.string().min(1),
        candidateEmail: z.string().optional(),
        position: z.string().min(1),
        department: z.string().optional(),
        startDate: z.string().optional(),
        salary: z.string().optional(),
        salaryPeriod: z.enum(["annual", "monthly", "hourly"]).optional(),
        bonus: z.string().optional(),
        equityShares: z.string().optional(),
        equityType: z.string().optional(),
        vestingMonths: z.number().optional(),
        cliffMonths: z.number().optional(),
        benefits: z.string().optional(),
        reportingTo: z.string().optional(),
        location: z.string().optional(),
        employmentType: z.enum(["full_time", "part_time", "contract", "intern"]).optional(),
        letterContent: z.string().optional(),
        status: z.enum(["draft", "sent", "viewed", "accepted", "declined", "expired"]).optional(),
        expiresAt: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const data = {
          ...input,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
          createdBy: ctx.user.id,
        };
        const result = await db.createOfferLetter(data as any);
        await createAuditLog(ctx.user.id, 'create', 'offer_letter', result.id, input.candidateName);
        return result;
      }),

    update: internalProcedure
      .input(z.object({
        id: z.number(),
        candidateName: z.string().optional(),
        candidateEmail: z.string().optional(),
        position: z.string().optional(),
        department: z.string().optional(),
        startDate: z.string().optional(),
        salary: z.string().optional(),
        salaryPeriod: z.enum(["annual", "monthly", "hourly"]).optional(),
        bonus: z.string().optional(),
        equityShares: z.string().optional(),
        equityType: z.string().optional(),
        vestingMonths: z.number().optional(),
        cliffMonths: z.number().optional(),
        benefits: z.string().optional(),
        reportingTo: z.string().optional(),
        location: z.string().optional(),
        employmentType: z.enum(["full_time", "part_time", "contract", "intern"]).optional(),
        letterContent: z.string().optional(),
        status: z.enum(["draft", "sent", "viewed", "accepted", "declined", "expired"]).optional(),
        sentAt: z.string().optional(),
        viewedAt: z.string().optional(),
        respondedAt: z.string().optional(),
        expiresAt: z.string().optional(),
        signatureUrl: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...rest } = input;
        const data: any = { ...rest };
        if (rest.startDate) data.startDate = new Date(rest.startDate);
        if (rest.sentAt) data.sentAt = new Date(rest.sentAt);
        if (rest.viewedAt) data.viewedAt = new Date(rest.viewedAt);
        if (rest.respondedAt) data.respondedAt = new Date(rest.respondedAt);
        if (rest.expiresAt) data.expiresAt = new Date(rest.expiresAt);
        const result = await db.updateOfferLetter(id, data);
        await createAuditLog(ctx.user.id, 'update', 'offer_letter', id);
        return result;
      }),

    delete: internalProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await createAuditLog(ctx.user.id, 'delete', 'offer_letter', input.id);
        return db.deleteOfferLetter(input.id);
      }),

    /** The email offerLetters.send would deliver, for the send dialog's preview. */
    preview: internalProcedure
      .input(z.object({ id: z.number(), message: z.string().max(5000).optional() }))
      .query(async ({ input, ctx }) => {
        const letter = await loadOfferLetter(input.id);
        const company = await loadCompany(letter.companyId);
        const rendered = renderOfferLetterEmail(letter, company, { message: input.message, senderName: ctx.user.name });
        return { ...rendered, to: letter.candidateEmail ?? null, status: letter.status ?? "draft" };
      }),

    /**
     * Email the offer to the candidate, then mark it sent. The status only
     * changes after the mail provider accepts the message.
     */
    send: internalProcedure
      .input(sendInput)
      .mutation(({ input, ctx }) => sendOfferLetter(input, ctx.user, "send")),

    /** Re-send an offer that has already gone out (status sent/viewed). */
    resend: internalProcedure
      .input(sendInput)
      .mutation(({ input, ctx }) => sendOfferLetter(input, ctx.user, "resend")),

    generate: internalProcedure
      .input(z.object({
        candidateName: z.string(),
        position: z.string(),
        department: z.string().optional(),
        salary: z.string(),
        salaryPeriod: z.string().optional(),
        equityShares: z.string().optional(),
        equityType: z.string().optional(),
        vestingMonths: z.number().optional(),
        cliffMonths: z.number().optional(),
        startDate: z.string().optional(),
        benefits: z.string().optional(),
        location: z.string().optional(),
        employmentType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const prompt = `Generate a professional offer letter for Superhumn Inc with these details:
    Candidate: ${input.candidateName}
    Position: ${input.position}
    Department: ${input.department || "Not specified"}
    Salary: $${input.salary} ${input.salaryPeriod || "annual"}
    Equity: ${input.equityShares || "None"} shares (${input.equityType || "N/A"})
    Vesting: ${input.vestingMonths || 0} months with ${input.cliffMonths || 0} month cliff
    Start Date: ${input.startDate || "TBD"}
    Location: ${input.location || "Remote"}
    Type: ${input.employmentType || "Full-time"}
    Benefits: ${input.benefits || "Standard benefits package"}

    Generate a warm, professional offer letter in markdown format. Include sections for:
    1. Welcome and position overview
    2. Compensation details
    3. Equity details (if applicable)
    4. Benefits summary
    5. Start date and logistics
    6. At-will employment clause
    7. Acceptance section with signature line

    Keep it concise but legally sound.`;

        const response = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are an HR professional drafting offer letters. Generate polished, legally-sound offer letters in markdown format.' },
            { role: 'user', content: prompt },
          ],
        });
        const content = typeof response.choices[0]?.message?.content === 'string'
          ? response.choices[0].message.content
          : '';
        return { content };
      }),
  });
