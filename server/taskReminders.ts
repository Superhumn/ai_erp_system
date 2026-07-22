/**
 * Task Reminder Email Service
 *
 * Emails human assignees about their outstanding project tasks — tasks that are
 * overdue or coming due within the next day. Runs on a daily background schedule
 * (registered in server/_core/index.ts). De-duped via projectTasks.reminderSentAt
 * so a still-open task is nudged at most once per run window.
 */
import * as db from "./db";
import { ENV } from "./_core/env";

// How far ahead to look for "due soon" tasks (tasks already overdue always qualify).
const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;
// Minimum gap between reminders for the same task. Slightly under 24h so the daily
// run reliably re-sends for tasks that are still open, without double-sending.
const REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000;

function formatDueDate(due: Date): string {
  return due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function dueDescription(due: Date, now: Date): { overdue: boolean; label: string } {
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((due.getTime() - now.getTime()) / dayMs);
  if (due.getTime() < now.getTime()) {
    const overdueDays = Math.max(1, Math.abs(diffDays));
    return { overdue: true, label: `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}` };
  }
  if (diffDays <= 0) return { overdue: false, label: "Due today" };
  return { overdue: false, label: `Due in ${diffDays} day${diffDays === 1 ? "" : "s"}` };
}

function renderTaskReminderHtml(
  task: { name: string; description: string | null; priority: string; status: string; projectName: string | null; dueDate: Date | null },
  assigneeName: string | null,
  due: Date,
  now: Date,
): string {
  const { overdue, label } = dueDescription(due, now);
  const accent = overdue ? "#dc2626" : "#6366f1";
  const greeting = assigneeName ? assigneeName.split(" ")[0] : "there";
  const tasksUrl = `${ENV.publicAppUrl}/projects`;
  return `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <p>Hi ${greeting},</p>
      <p>This is a reminder about an outstanding task assigned to you:</p>
      <div style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid ${accent};">
        <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">${task.name}</p>
        <p style="margin: 0 0 12px 0; font-weight: 600; color: ${accent};">${label} — ${formatDueDate(due)}</p>
        ${task.projectName ? `<p style="margin: 4px 0; font-size: 14px; color: #555;"><strong>Project:</strong> ${task.projectName}</p>` : ""}
        <p style="margin: 4px 0; font-size: 14px; color: #555;"><strong>Priority:</strong> ${task.priority} &nbsp;·&nbsp; <strong>Status:</strong> ${task.status}</p>
        ${task.description ? `<p style="margin: 12px 0 0 0; font-size: 14px; color: #333;">${task.description}</p>` : ""}
      </div>
      <div style="margin: 24px 0;">
        <a href="${tasksUrl}"
           style="display: inline-block; background: ${accent}; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          View Task
        </a>
      </div>
      <p style="font-size: 13px; color: #888;">You're receiving this because this task is assigned to you and is ${overdue ? "overdue" : "coming due"}. It will stop once the task is marked complete.</p>
    </div>
  `;
}

export interface TaskReminderResult {
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Find outstanding tasks and email their human assignees. Safe to call repeatedly:
 * the reminderSentAt cooldown prevents duplicate sends within a run window, and a
 * task's reminderSentAt is only advanced when its email actually goes out.
 */
export async function sendTaskReminders(): Promise<TaskReminderResult> {
  try {
    const now = new Date();
    const dueBefore = new Date(now.getTime() + DUE_SOON_WINDOW_MS);
    const reminderCutoff = new Date(now.getTime() - REMINDER_COOLDOWN_MS);

    const tasks = await db.getProjectTasksNeedingReminders({ dueBefore, reminderCutoff });
    if (!tasks.length) return { sent: 0, failed: 0, skipped: 0 };

    const { sendEmail } = await import("./_core/email");
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const task of tasks) {
      const email = task.assigneeEmail;
      const due = task.dueDate ? new Date(task.dueDate) : null;
      if (!email || !due) {
        skipped++;
        continue;
      }

      const { overdue } = dueDescription(due, now);
      const subject = `${overdue ? "Overdue task" : "Task reminder"}: ${task.name}`;
      const html = renderTaskReminderHtml(task, task.assigneeName, due, now);

      try {
        const result = await sendEmail({ to: email, subject, html });
        if (result.success) {
          // Only advance the cooldown when the email actually sent, so a failed or
          // unconfigured send is retried on the next run rather than silently skipped.
          await db.updateProjectTask(task.id, { reminderSentAt: now });
          sent++;
        } else {
          failed++;
          console.warn(`[Task Reminder] Send failed for task ${task.id}: ${result.error}`);
        }
      } catch (e) {
        failed++;
        console.warn(`[Task Reminder] Error sending for task ${task.id}:`, e);
      }
    }

    return { sent, failed, skipped };
  } catch (e) {
    console.warn("[Task Reminder] Error:", e);
    return { sent: 0, failed: 0, skipped: 0 };
  }
}
