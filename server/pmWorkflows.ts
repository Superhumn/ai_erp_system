// PM module autonomous workflows.
//
// These are pure functions that perform one round of work. The codebase
// already has a workflow engine (`autonomousWorkflowEngine.ts`) that owns
// scheduling — wire these up in production by registering each function as
// a scheduled job, or call the exposed tRPC `pm.workflows.*` mutations from
// an external cron / GitHub Action.
//
// 1. blockerAlert       — Mon 09:00 — Google Chat post for projects blocked >7 days
// 2. milestoneDue       — Daily 08:00 — notify owners of milestones due in 7 days
// 3. cashForecastSync   — Triggered on pm_project status → complete
// 4. dependencyCascade  — Triggered on pm_project status → blocked
// 5. weeklyDigest       — Fri 16:00 — generate matrix snapshot, save to Drive

import { eq } from "drizzle-orm";
import * as db from "./db";
import { ENV } from "./_core/env";
import { pmProjects } from "../drizzle/schema";

const GOOGLE_CHAT_OPS_WEBHOOK = ENV.googleChatOpsWebhook;

async function postToGoogleChat(text: string): Promise<{ posted: boolean; error?: string }> {
  if (!GOOGLE_CHAT_OPS_WEBHOOK) {
    console.warn("[pmWorkflows] GOOGLE_CHAT_OPS_WEBHOOK not set; skipping post");
    return { posted: false, error: "webhook not configured" };
  }
  try {
    const response = await fetch(GOOGLE_CHAT_OPS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const err = await response.text();
      return { posted: false, error: `chat ${response.status}: ${err}` };
    }
    return { posted: true };
  } catch (error) {
    return { posted: false, error: String(error) };
  }
}

function daysSince(date: Date | null | undefined): number {
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
}

// ---- 1. Blocker alert ----

export async function runBlockerAlertWorkflow() {
  const blocked = await db.getPmBlockedProjects();
  const stale = blocked.filter(p => daysSince(p.blockedSince) >= 7);

  if (stale.length === 0) {
    return { posted: false, count: 0, reason: "no projects blocked >7 days" };
  }

  const lines = stale.map(p =>
    `• *${p.name}* — blocked ${daysSince(p.blockedSince)} days — ${p.blockerReason ?? "no reason logged"}`
  );
  const text = `🚧 *PM weekly blocker report* — ${stale.length} project(s) blocked >7 days\n\n${lines.join("\n")}`;

  const post = await postToGoogleChat(text);
  return { ...post, count: stale.length, projects: stale.map(p => ({ id: p.id, name: p.name })) };
}

// Alias used by the router trigger.
export const workflow_blocker_alert = runBlockerAlertWorkflow;

// ---- 2. Milestone due ----

export async function runMilestoneDueWorkflow() {
  const upcoming = await db.getPmMilestonesDueSoon(7);
  if (upcoming.length === 0) {
    return { notified: 0, reason: "no milestones due in the next 7 days" };
  }

  // For each milestone, find the owning project's owner and create a notification.
  let notified = 0;
  for (const m of upcoming) {
    const project = await db.getPmProjectById(m.projectId);
    if (!project?.ownerUserId) continue;
    const daysUntil = Math.ceil((new Date(m.targetDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    await db.createNotification({
      userId: project.ownerUserId,
      type: "reminder",
      title: `Milestone due in ${daysUntil} day(s): ${m.name}`,
      message: `Project: ${project.name}`,
      entityType: "pmMilestone",
      entityId: m.id,
      severity: daysUntil <= 2 ? "warning" : "info",
      link: `/pm/project/${project.id}`,
    });
    notified++;
  }
  return { notified, milestones: upcoming.length };
}

export const workflow_milestone_due = runMilestoneDueWorkflow;

// ---- 3. Cash forecast sync ----
//
// Called from the router when a pm_project transitions to "complete". Pushes
// the project's cash_event_* fields into the financial_model table.

export async function runCashForecastSyncWorkflow(projectId: number) {
  return db.pushPmCashEventToFinancialModel(projectId);
}

export const workflow_cash_forecast_sync = runCashForecastSyncWorkflow;

// ---- 4. Dependency cascade ----
//
// Called from the router when a pm_project transitions to "blocked". Flags
// all downstream `blocks`-type dependents as at-risk.

export async function runDependencyCascadeWorkflow(blockedProjectId: number) {
  const downstream = await db.getPmDownstreamProjects(blockedProjectId);
  if (downstream.length === 0) return { flagged: 0 };

  const database = await db.getDb();
  if (!database) return { flagged: 0, error: "database unavailable" };

  for (const p of downstream) {
    await database.update(pmProjects).set({ atRisk: true }).where(eq(pmProjects.id, p.id));
    if (p.ownerUserId) {
      await db.createNotification({
        userId: p.ownerUserId,
        type: "warning",
        title: `Upstream blocker — "${p.name}" flagged at risk`,
        message: `An upstream dependency was just blocked.`,
        entityType: "pmProject",
        entityId: p.id,
        severity: "warning",
        link: `/pm/project/${p.id}`,
      });
    }
  }
  return { flagged: downstream.length, projects: downstream.map(p => ({ id: p.id, name: p.name })) };
}

export const workflow_dependency_cascade = runDependencyCascadeWorkflow;

// ---- 5. Weekly digest ----
//
// Generates a JSON snapshot of the matrix. In production this is uploaded to
// a Drive folder via `_core/googleDrive.ts`. Here we return the snapshot
// payload; the caller is responsible for the upload step (kept side-effect
// free so it can also be diffed in CI).

export async function runWeeklyDigestWorkflow() {
  const matrix = await db.getPmMatrix();
  const blocked = await db.getPmBlockedProjects();
  const cashForecast = await db.getPmCashForecast();
  const ownerCapacity = await db.getPmOwnerCapacity();

  const snapshot = {
    generatedAt: new Date().toISOString(),
    matrix: {
      markets: matrix.markets.length,
      functions: matrix.functions.length,
      cellsWithProjects: matrix.cells.filter(c => c.projects.length > 0).length,
      totalProjects: matrix.cells.reduce((sum, c) => sum + c.projects.length, 0),
    },
    blockedCount: blocked.length,
    cashEventsNext90Days: cashForecast.byMonth.filter(m => {
      const date = new Date(m.year, m.month - 1, 1);
      return date.getTime() <= Date.now() + 90 * 24 * 60 * 60 * 1000;
    }),
    topOwnersByLoad: ownerCapacity.slice(0, 5).map(o => ({
      ownerUserId: o.ownerUserId,
      name: o.user?.name ?? null,
      total: o.total,
    })),
    raw: { matrix, blocked, cashForecast, ownerCapacity },
  };

  // TODO: wire upload to Drive folder. See `_core/googleDrive.ts` →
  // `syncDriveFolder` / `createGoogleDoc` for the existing helpers.
  console.log("[pmWorkflows] weekly digest generated", {
    blockedCount: snapshot.blockedCount,
    totalProjects: snapshot.matrix.totalProjects,
  });
  return snapshot;
}

export const workflow_weekly_digest = runWeeklyDigestWorkflow;

// ---- Status-transition entry points (called from the router) ----

export async function onPmProjectCompleted(projectId: number) {
  return runCashForecastSyncWorkflow(projectId);
}

export async function onPmProjectBlocked(projectId: number) {
  return runDependencyCascadeWorkflow(projectId);
}
