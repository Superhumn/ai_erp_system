// appRouter.notes — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { parseNoteWithLLM } from "../notesParser";
import type { NoteAppliedItem, NoteParseResult } from "@shared/notes";
import * as db from "../db";

// ============================================
// QUICK NOTES — Apple-Notes-style capture + LLM routing
// ============================================
export const notesRouter = router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
      .query(async ({ input, ctx }) => {
        return db.listNotesForUser(ctx.user.id, input?.limit ?? 100);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const note = await db.getNoteById(input.id, ctx.user.id);
        if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
        return note;
      }),

    create: protectedProcedure
      .input(z.object({
        content: z.string().min(1, "Note is empty"),
        title: z.string().optional(),
        autoParse: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id } = await db.createNote({
          userId: ctx.user.id,
          title: input.title,
          content: input.content,
          status: "draft",
        });

        if (input.autoParse === false) {
          return { id, parsed: null as NoteParseResult | null };
        }

        try {
          const parsed = await parseNoteWithLLM(input.content, new Date().toISOString().slice(0, 10));
          await db.updateNote(id, {
            title: input.title || parsed.title || undefined,
            parsedItems: parsed,
            status: "parsed",
            parsedAt: new Date(),
            parseError: null,
          });
          return { id, parsed };
        } catch (err) {
          await db.updateNote(id, {
            parseError: err instanceof Error ? err.message : String(err),
          });
          return { id, parsed: null };
        }
      }),

    parse: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const note = await db.getNoteById(input.id, ctx.user.id);
        if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
        try {
          const parsed = await parseNoteWithLLM(note.content, new Date().toISOString().slice(0, 10));
          await db.updateNote(input.id, {
            title: note.title || parsed.title || undefined,
            parsedItems: parsed,
            status: "parsed",
            parsedAt: new Date(),
            parseError: null,
          });
          return parsed;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await db.updateNote(input.id, { parseError: msg });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        content: z.string().optional(),
        title: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const note = await db.getNoteById(input.id, ctx.user.id);
        if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

        // When the content changes, any prior parse is stale — clear parse
        // state and drop the note back to draft so the user re-parses.
        const patch: Partial<typeof note> = { title: input.title };
        if (input.content !== undefined && input.content !== note.content) {
          patch.content = input.content;
          patch.parsedItems = null;
          patch.parsedAt = null;
          patch.parseError = null;
          patch.status = "draft";
        }
        await db.updateNote(input.id, patch);
        return { ok: true };
      }),

    applyItems: protectedProcedure
      .input(z.object({
        id: z.number(),
        itemIds: z.array(z.string()).min(1, "Pick at least one item to apply"),
      }))
      .mutation(async ({ input, ctx }) => {
        const note = await db.getNoteById(input.id, ctx.user.id);
        if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
        const parsed = note.parsedItems;
        if (!parsed || !Array.isArray(parsed.items)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Note has not been parsed yet" });
        }

        const selected = parsed.items.filter((it) => input.itemIds.includes(it.id));
        const applied: NoteAppliedItem[] = [];

        for (const item of selected) {
          if (item.kind === "task") {
            const projectId = await db.getOrCreateNotesInboxProject(ctx.user.id);
            const due = item.dueDate ? new Date(item.dueDate) : undefined;
            const { id: taskId } = await db.createProjectTask({
              projectId,
              name: item.title || item.summary.slice(0, 200),
              description: item.description || `From note #${note.id}`,
              status: "todo",
              priority: item.priority || "medium",
              dueDate: due && !isNaN(due.getTime()) ? due : undefined,
              sourceType: "manual",
              sourceRefType: "note",
              sourceRefId: note.id,
              createdBy: ctx.user.id,
            });
            applied.push({
              kind: "task",
              itemId: item.id,
              entityType: "project_task",
              entityId: Number(taskId),
              label: item.title || item.summary,
            });
          } else if (item.kind === "crm_contact") {
            const fullName = [item.firstName, item.lastName].filter(Boolean).join(" ").trim()
              || item.firstName || item.organization || "Unnamed contact";
            const { id: contactId, created } = await db.findOrCreateCrmContact({
              firstName: item.firstName || fullName,
              lastName: item.lastName,
              fullName,
              email: item.email,
              phone: item.phone,
              organization: item.organization,
              jobTitle: item.jobTitle,
              contactType: item.contactType || "lead",
              source: "manual",
              notes: item.notes || `From note #${note.id}`,
              capturedBy: ctx.user.id,
              captureData: JSON.stringify({ noteId: note.id, sourceQuote: item.sourceQuote }),
            });
            applied.push({
              kind: "crm_contact",
              itemId: item.id,
              entityType: "crm_contact",
              entityId: Number(contactId),
              label: `${created ? "Created" : "Merged into"} ${fullName}`,
            });
          } else if (item.kind === "reminder") {
            const remindAt = item.remindAt ? new Date(item.remindAt) : undefined;
            // Reminders piggyback on the notifications table so they show up
            // in the existing notification center.
            const notificationId = await db.createNotification({
              userId: ctx.user.id,
              type: "reminder",
              title: item.title || "Reminder",
              message: item.summary,
              entityType: "note",
              entityId: note.id,
              link: `/notes`,
              metadata: remindAt && !isNaN(remindAt.getTime())
                ? { remindAt: remindAt.toISOString(), noteId: note.id }
                : { noteId: note.id },
            });
            applied.push({
              kind: "reminder",
              itemId: item.id,
              entityType: "notification",
              entityId: notificationId ? Number(notificationId) : null,
              label: item.title || item.summary,
            });
          } else if (item.kind === "idea") {
            // Ideas just stay on the note — no external entity to create.
            applied.push({
              kind: "idea",
              itemId: item.id,
              entityType: "idea",
              entityId: null,
              label: item.title || item.summary,
            });
          }
        }

        // Idempotent merge: if an item was already applied (by itemId),
        // keep the older record so retries don't create duplicate entries.
        const existingApplied = note.appliedItems ?? [];
        const existingIds = new Set(existingApplied.map((a) => a.itemId));
        const newOnes = applied.filter((a) => !existingIds.has(a.itemId));
        const merged: NoteAppliedItem[] = [...existingApplied, ...newOnes];

        await db.updateNote(note.id, {
          appliedItems: merged,
          status: "applied",
          appliedAt: new Date(),
        });

        return { applied };
      }),

    discard: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const note = await db.getNoteById(input.id, ctx.user.id);
        if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
        await db.updateNote(input.id, { status: "discarded" });
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const note = await db.getNoteById(input.id, ctx.user.id);
        if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
        await db.deleteNote(input.id, ctx.user.id);
        return { ok: true };
      }),
  });
