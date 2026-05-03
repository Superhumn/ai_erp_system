import { z } from "zod";
import * as db from "../db/code";
import { router, protectedProcedure } from "./middleware";
import { processCodeAIRequest, executeCodeSandboxed, type CodeAction } from "../codeService";

export const codeRouter = router({
  code: router({
    // ============================================
    // SNIPPETS CRUD
    // ============================================
    snippets: protectedProcedure.query(({ ctx }) =>
      db.getCodeSnippets(ctx.user.id)
    ),

    getSnippet: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getCodeSnippetById(input.id)),

    searchSnippets: protectedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(({ input, ctx }) => db.searchCodeSnippets(ctx.user.id, input.query)),

    createSnippet: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        language: z.string().default("typescript"),
        code: z.string(),
        tags: z.string().optional(),
        isPublic: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        return db.createCodeSnippet({
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          language: input.language,
          code: input.code,
          tags: input.tags,
          isPublic: input.isPublic,
        });
      }),

    updateSnippet: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        language: z.string().optional(),
        code: z.string().optional(),
        tags: z.string().optional(),
        isPublic: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return db.updateCodeSnippet(id, data);
      }),

    deleteSnippet: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteCodeSnippet(input.id)),

    // ============================================
    // CODE EXECUTION
    // ============================================
    execute: protectedProcedure
      .input(z.object({
        code: z.string().min(1),
        language: z.string(),
        snippetId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Create execution record
        const exec = await db.createCodeExecution({
          userId: ctx.user.id,
          snippetId: input.snippetId ?? null,
          language: input.language,
          code: input.code,
          status: "running",
        });

        // Run the code
        const result = await executeCodeSandboxed(input.code, input.language);

        // Update execution record with results
        const status = result.exitCode === 0 ? "completed" : result.exitCode === 137 ? "timeout" : "failed";
        await db.updateCodeExecution(exec.id, {
          output: result.output,
          errorOutput: result.errorOutput,
          exitCode: result.exitCode,
          executionTimeMs: result.executionTimeMs,
          status,
        });

        return {
          id: exec.id,
          output: result.output,
          errorOutput: result.errorOutput,
          exitCode: result.exitCode,
          executionTimeMs: result.executionTimeMs,
          status,
        };
      }),

    executions: protectedProcedure
      .input(z.object({ snippetId: z.number().optional() }))
      .query(({ input, ctx }) =>
        db.getCodeExecutions(ctx.user.id, input.snippetId)
      ),

    // ============================================
    // AI ACTIONS
    // ============================================
    aiAction: protectedProcedure
      .input(z.object({
        action: z.enum(["generate", "explain", "debug", "refactor", "review", "test", "document", "optimize"]),
        prompt: z.string().min(1),
        code: z.string().optional(),
        language: z.string().default("typescript"),
        context: z.string().optional(),
        snippetId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await processCodeAIRequest({
          action: input.action as CodeAction,
          prompt: input.prompt,
          code: input.code,
          language: input.language,
          context: input.context,
        });

        // Save AI session
        await db.createCodeAiSession({
          userId: ctx.user.id,
          snippetId: input.snippetId ?? null,
          action: input.action,
          prompt: input.prompt,
          inputCode: input.code ?? null,
          outputCode: result.outputCode,
          explanation: result.explanation,
          model: result.model,
          tokensUsed: result.tokensUsed,
        });

        return result;
      }),

    aiSessions: protectedProcedure
      .input(z.object({ snippetId: z.number().optional() }))
      .query(({ input, ctx }) =>
        db.getCodeAiSessions(ctx.user.id, input.snippetId)
      ),
  }),
});
