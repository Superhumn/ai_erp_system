/**
 * Scheduled Jobs Runner
 *
 * Runs background tasks on configurable intervals.
 * Start alongside the main server or as a separate process:
 *   pnpm tsx server/scheduledJobs.ts
 *
 * In production, you can also trigger these via external cron (e.g., Railway cron, GitHub Actions)
 * by calling the tRPC endpoints directly.
 */
import { runShortageCheckAndNotify, runAnomalyCheckAndNotify } from "./materialShortageService";
import { checkAndSendPoFollowups } from "./vendorEmailAutomation";

interface Job {
  name: string;
  intervalMs: number;
  fn: () => Promise<unknown>;
  lastRun?: number;
  timer?: ReturnType<typeof setInterval>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const jobs: Job[] = [
  {
    name: "Material Shortage Check",
    intervalMs: 4 * HOUR,
    fn: async () => {
      const result = await runShortageCheckAndNotify();
      console.log(`[Shortage Check] ${result.shortageCount} shortages found`);
      return result;
    },
  },
  {
    name: "Anomaly Detection",
    intervalMs: 6 * HOUR,
    fn: async () => {
      const result = await runAnomalyCheckAndNotify();
      console.log(`[Anomaly Check] ${result.alertCount} anomalies found`);
      return result;
    },
  },
  {
    name: "PO Follow-up Emails",
    intervalMs: 24 * HOUR,
    fn: async () => {
      const result = await checkAndSendPoFollowups();
      console.log(`[PO Follow-ups] ${result.sent} follow-up emails sent`);
      return result;
    },
  },
];

function startJobs() {
  console.log(`[Scheduler] Starting ${jobs.length} scheduled jobs:\n`);

  for (const job of jobs) {
    const intervalHrs = (job.intervalMs / HOUR).toFixed(1);
    console.log(`  - ${job.name} (every ${intervalHrs}h)`);

    // Run once after a short delay to let the app initialize
    setTimeout(async () => {
      try {
        await job.fn();
        job.lastRun = Date.now();
      } catch (err) {
        console.error(`[Scheduler] ${job.name} initial run failed:`, err);
      }
    }, 30_000); // 30s startup delay

    // Then run on interval
    job.timer = setInterval(async () => {
      try {
        await job.fn();
        job.lastRun = Date.now();
      } catch (err) {
        console.error(`[Scheduler] ${job.name} failed:`, err);
      }
    }, job.intervalMs);
  }

  console.log("\n[Scheduler] All jobs scheduled.\n");
}

function stopJobs() {
  for (const job of jobs) {
    if (job.timer) {
      clearInterval(job.timer);
      job.timer = undefined;
    }
  }
  console.log("[Scheduler] All jobs stopped.");
}

// Export for integration with main server
export { startJobs, stopJobs, jobs };

// If run directly as a standalone process
if (process.argv[1]?.endsWith("scheduledJobs.ts") || process.argv[1]?.endsWith("scheduledJobs.js")) {
  console.log("[Scheduler] Running as standalone process");
  startJobs();

  process.on("SIGINT", () => {
    stopJobs();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stopJobs();
    process.exit(0);
  });
}
