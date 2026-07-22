import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db/code";
import { router, adminProcedure } from "./middleware";
import { processCodeAIRequest, executeCodeSandboxed, isCodeExecutionEnabled, type CodeAction } from "../codeService";

// NOTE: This is the live code router. It is mounted at `code` in the monolith
// (server/routers.ts) and in the extracted tree (server/routers/index.ts).
// The in-browser IDE it backs is an admin-only tool (see CLAUDE.md) and
// `execute` runs arbitrary code on the server host, so every procedure is
// gated behind `adminProcedure` as defense-in-depth — the hidden nav item is
// not a real access control.
export const codeRouter = router({
  // ============================================
  // SNIPPETS CRUD
  // ============================================
  snippets: adminProcedure.query(({ ctx }) =>
    db.getCodeSnippets(ctx.user.id)
  ),

  getSnippet: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      // Same visibility rule as the list/search: owner-or-public only.
      const snippet = await db.getCodeSnippetById(input.id);
      if (!snippet || (snippet.userId !== ctx.user.id && !snippet.isPublic)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Snippet not found" });
      }
      return snippet;
    }),

  searchSnippets: adminProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(({ input, ctx }) => db.searchCodeSnippets(ctx.user.id, input.query)),

  createSnippet: adminProcedure
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

  updateSnippet: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      language: z.string().optional(),
      code: z.string().optional(),
      tags: z.string().optional(),
      isPublic: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      // Only the owner may modify a snippet, even for admins.
      const existing = await db.getCodeSnippetById(id);
      if (!existing || existing.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Snippet not found" });
      }
      return db.updateCodeSnippet(id, data);
    }),

  deleteSnippet: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Only the owner may delete a snippet, even for admins.
      const existing = await db.getCodeSnippetById(input.id);
      if (!existing || existing.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Snippet not found" });
      }
      return db.deleteCodeSnippet(input.id);
    }),

  // ============================================
  // CODE EXECUTION
  // ============================================
  execute: adminProcedure
    .input(z.object({
      code: z.string().min(1),
      language: z.string(),
      snippetId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Refuse early (before writing a record) if this deployment hasn't
      // opted into server-side execution.
      if (!isCodeExecutionEnabled()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Code execution is disabled on this deployment. An administrator must set CODE_EXEC_ENABLED=true to enable it (runs code on the server host).",
        });
      }

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

  executions: adminProcedure
    .input(z.object({ snippetId: z.number().optional() }))
    .query(({ input, ctx }) =>
      db.getCodeExecutions(ctx.user.id, input.snippetId)
    ),

  // ============================================
  // AI ACTIONS
  // ============================================
  aiAction: adminProcedure
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

  aiSessions: adminProcedure
    .input(z.object({ snippetId: z.number().optional() }))
    .query(({ input, ctx }) =>
      db.getCodeAiSessions(ctx.user.id, input.snippetId)
    ),
});
