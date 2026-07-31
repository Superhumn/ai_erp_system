// ============================================================================
// Ops Toolkit — automation engine (Item 3)
//
// Evaluates lightweight "trigger -> conditions -> action" rules against a record
// and executes the action (email, in-app notification, or webhook). The trigger
// side is fired by callers via `fireAutomationEvent(...)`; the intake-form
// submission path wires this in for `form_submitted`, and any module mutation can
// call it with `record_created` / `record_updated` / `field_changed`.
//
// Condition evaluation is pure and exported so it can be unit-tested without a DB.
// ============================================================================

import type {
  AutomationCondition,
  AutomationActionConfig,
  AutomationTriggerConfig,
} from "@shared/opsToolkit";
import * as db from "./db";
import { sendEmail } from "./_core/email";
import type { AutomationRule } from "../drizzle/schema";
import {
  evaluateConditions, fieldChangeMatches, interpolate, type RecordLike,
} from "./opsAutomationConditions";

// Re-export the pure predicates so existing importers keep working.
export { evaluateCondition, evaluateConditions, fieldChangeMatches } from "./opsAutomationConditions";

interface FireEventArgs {
  module: string;
  triggerType: "record_created" | "record_updated" | "field_changed" | "form_submitted" | "scheduled";
  record: RecordLike;
  previous?: RecordLike;
  /** User whose notification inbox should receive create_notification actions when unspecified. */
  actorUserId?: number;
}

interface FireResult {
  matched: number;
  executed: number;
  results: Array<{ ruleId: number; status: "success" | "failed" | "skipped"; detail: string }>;
}

async function executeAction(
  rule: AutomationRule,
  record: RecordLike,
  actorUserId?: number,
): Promise<string> {
  const cfg = (rule.actionConfig || {}) as AutomationActionConfig;
  switch (rule.actionType) {
    case "send_email": {
      const to = cfg.to ? interpolate(cfg.to, record) : "";
      if (!to) throw new Error("send_email action missing recipient");
      const subject = interpolate(cfg.subject || `Automation: ${rule.name}`, record);
      const body = interpolate(cfg.body || "", record);
      const res = await sendEmail({ to, subject, text: body || subject });
      if (!res.success) throw new Error(res.error || "email send failed");
      return `emailed ${to}`;
    }
    case "create_notification": {
      const userId = cfg.notifyUserId ?? actorUserId;
      if (!userId) throw new Error("create_notification action missing target user");
      const message = interpolate(cfg.message || rule.name, record);
      await db.createNotification({
        userId,
        type: "info",
        title: rule.name,
        message,
      });
      return `notified user ${userId}`;
    }
    case "webhook": {
      const url = cfg.url;
      if (!url) throw new Error("webhook action missing url");
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rule: rule.name, module: rule.module, record }),
      });
      if (!res.ok) throw new Error(`webhook returned ${res.status}`);
      return `POST ${url} -> ${res.status}`;
    }
    default:
      throw new Error(`unknown action type ${(rule as { actionType: string }).actionType}`);
  }
}

/**
 * Fire all active rules for a given module + trigger type against a record.
 * Each rule's conditions are checked; matching rules execute and are logged.
 * Never throws — failures are captured per-rule so callers (module mutations,
 * form submissions) are never broken by a misconfigured automation.
 */
export async function fireAutomationEvent(args: FireEventArgs): Promise<FireResult> {
  const out: FireResult = { matched: 0, executed: 0, results: [] };
  let rules: AutomationRule[] = [];
  try {
    rules = (await db.listActiveAutomationRules(args.module, args.triggerType)) as AutomationRule[];
  } catch {
    return out;
  }

  for (const rule of rules) {
    try {
      // field_changed gate
      if (rule.triggerType === "field_changed") {
        const tc = (rule.triggerConfig || {}) as AutomationTriggerConfig;
        if (!fieldChangeMatches(tc, args.record, args.previous)) {
          continue;
        }
      }
      // form_submitted may be scoped to a specific form id
      if (rule.triggerType === "form_submitted") {
        const tc = (rule.triggerConfig || {}) as AutomationTriggerConfig;
        const formId = (args.record.formId ?? args.record.__formId) as number | undefined;
        if (tc.formId && formId && tc.formId !== formId) continue;
      }

      const conditions = (rule.conditions || []) as AutomationCondition[];
      if (!evaluateConditions(args.record, conditions)) {
        out.results.push({ ruleId: rule.id, status: "skipped", detail: "conditions not met" });
        await db.recordAutomationRun({ ruleId: rule.id, status: "skipped", triggerContext: args.record as any, result: "conditions not met" });
        continue;
      }

      out.matched++;
      const detail = await executeAction(rule, args.record, args.actorUserId);
      out.executed++;
      out.results.push({ ruleId: rule.id, status: "success", detail });
      await db.recordAutomationRun({ ruleId: rule.id, status: "success", triggerContext: args.record as any, result: detail });
      await db.markAutomationRuleRan(rule.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.results.push({ ruleId: rule.id, status: "failed", detail: msg });
      await db.recordAutomationRun({ ruleId: rule.id, status: "failed", triggerContext: args.record as any, error: msg });
    }
  }
  return out;
}

/**
 * Manually run a single rule against a supplied record (used by the "Test run"
 * button in the automation builder). Returns the action detail or throws.
 */
export async function testRunRule(ruleId: number, sampleRecord: RecordLike, actorUserId?: number): Promise<string> {
  const rule = (await db.getAutomationRuleById(ruleId)) as AutomationRule | null;
  if (!rule) throw new Error("rule not found");
  const conditions = (rule.conditions || []) as AutomationCondition[];
  if (!evaluateConditions(sampleRecord, conditions)) {
    return "Conditions not met — action would be skipped.";
  }
  return executeAction(rule, sampleRecord, actorUserId);
}
