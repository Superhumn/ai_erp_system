/**
 * Error tracking utility.
 * When SENTRY_DSN is set, captures errors to Sentry.
 * Otherwise, logs errors in structured format.
 */

import { createLogger } from "./logger";

const logger = createLogger("ErrorTracking");

let sentryInitialized = false;

export async function initErrorTracking() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info("Sentry not configured — errors will only be logged to stdout");
    return;
  }

  try {
    // @ts-ignore — @sentry/node is an optional peer dependency
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: 0.1,
    });
    sentryInitialized = true;
    logger.info("Sentry error tracking initialized");
  } catch (e) {
    logger.warn("Failed to initialize Sentry — install @sentry/node to enable", { error: String(e) });
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  logger.error("Unhandled exception", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });

  if (sentryInitialized) {
    try {
      const Sentry = require("@sentry/node");
      if (context) Sentry.setContext("additional", context);
      Sentry.captureException(error);
    } catch {
      // Sentry capture failed silently
    }
  }
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info") {
  logger.info(message, { sentryLevel: level });

  if (sentryInitialized) {
    try {
      const Sentry = require("@sentry/node");
      Sentry.captureMessage(message, level);
    } catch {
      // Sentry capture failed silently
    }
  }
}
