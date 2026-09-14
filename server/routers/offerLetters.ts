// appRouter.offerLetters — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { createAuditLog } from "./_shared";

// ============================================
// OFFER LETTERS
// ============================================
export const offerLettersRouter = router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        status: z.string().optional(),
      }).optional())
      .query(({ input }) => db.getOfferLetters(input)),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getOfferLetterById(input.id)),

    create: protectedProcedure
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

    update: protectedProcedure
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

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await createAuditLog(ctx.user.id, 'delete', 'offer_letter', input.id);
        return db.deleteOfferLetter(input.id);
      }),

    generate: protectedProcedure
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
