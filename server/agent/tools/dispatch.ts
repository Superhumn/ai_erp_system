import { runSalesPipelineWorkflow } from "./adapters/sales";
import { runFinanceWorkflow } from "./adapters/finance";
import { queryDatabase } from "./adapters/db";
import { runSupplyChainWorkflow } from "./adapters/supplyChain";
import { runEmailCommunication } from "./adapters/email";
import { runPhoneCall } from "./adapters/call";
import { runContactLookup } from "./adapters/contacts";
import { captureBeforeSnapshot, recordAuditEntry } from "../audit";
import type { ToolAdapterInput, ToolAdapterResult } from "../types";

/**
 * Identifies which tool+action combinations are mutations
 * and what table/rowId to snapshot for undo support.
 */
function getMutationInfo(name: string, input: Record<string, any>): {
  isMutation: boolean;
  tableName: string;
  rowId?: number;
  operationType: "insert" | "update" | "delete" | "email_sent" | "call_made";
  description: string;
} | null {
  const payload = input.payload ?? {};
  const action = input.action;

  switch (name) {
    case "run_sales_pipeline_workflow":
      if (action === "update_order_status") {
        return {
          isMutation: true,
          tableName: "orders",
          rowId: payload.orderId,
          operationType: "update",
          description: `Update order #${payload.orderId} status to "${payload.newStatus}"`,
        };
      }
      return null;

    case "send_email":
      if (action === "send_email") {
        return {
          isMutation: true,
          tableName: "sentEmails",
          operationType: "email_sent",
          description: `Email to ${payload.contactType ?? "contact"} #${payload.contactId ?? "?"}: ${payload.subject ?? payload.purpose ?? "no subject"}`,
        };
      }
      return null;

    case "make_phone_call":
      if (action === "make_call" || action === "log_call") {
        return {
          isMutation: true,
          tableName: "agentCallLogs",
          operationType: "call_made",
          description: `Call to ${payload.contactType ?? "contact"} #${payload.contactId ?? "?"}: ${payload.purpose ?? "no purpose"}`,
        };
      }
      return null;

    case "manage_contacts":
      if (action === "add_note") {
        return {
          isMutation: true,
          tableName: "crmInteractions",
          operationType: "insert",
          description: `Note on ${payload.contactType ?? "contact"} #${payload.contactId ?? "?"}: ${(payload.note ?? "").slice(0, 100)}`,
        };
      }
      return null;

    case "run_supply_chain_workflow":
      return {
        isMutation: true,
        tableName: "workflowRuns",
        operationType: "insert",
        description: `Triggered ${input.workflowType ?? "unknown"} workflow`,
      };

    default:
      return null;
  }
}

/**
 * Dispatches a tool call to the appropriate adapter.
 * Wraps mutations with audit trail capture for undo support.
 * Returns the result as a JSON string for the agent message history.
 */
export async function dispatchTool(
  name: string,
  input: unknown,
  agentRunId?: number,
): Promise<string> {
  const i = input as ToolAdapterInput;
  const inputObj = input as Record<string, any>;

  // Check if this is a mutation that needs auditing
  const mutationInfo = agentRunId ? getMutationInfo(name, inputObj) : null;
  let beforeSnapshot: Record<string, unknown> | null = null;

  // Capture before-snapshot for updates
  if (mutationInfo?.rowId && mutationInfo.operationType === "update") {
    beforeSnapshot = await captureBeforeSnapshot(mutationInfo.tableName, mutationInfo.rowId);
  }

  // Execute the tool
  let result: ToolAdapterResult;
  switch (name) {
    case "run_sales_pipeline_workflow":
      result = await runSalesPipelineWorkflow(i);
      break;
    case "run_finance_workflow":
      result = await runFinanceWorkflow(i);
      break;
    case "query_database":
      result = await queryDatabase(i);
      break;
    case "run_supply_chain_workflow":
      result = await runSupplyChainWorkflow(i);
      break;
    case "send_email":
      result = await runEmailCommunication(i as any);
      break;
    case "make_phone_call":
      result = await runPhoneCall(i as any);
      break;
    case "manage_contacts":
      result = await runContactLookup(i as any);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  // Record audit trail for successful mutations
  if (mutationInfo && agentRunId && result.success) {
    // Extract the created row ID from the result if available
    const resultData = result.data as Record<string, any> | undefined;
    const rowId = mutationInfo.rowId
      ?? resultData?.emailId
      ?? resultData?.callLogId
      ?? resultData?.runId
      ?? resultData?.orderId;

    // Capture after-snapshot for updates
    let afterSnapshot: Record<string, unknown> | null = null;
    if (rowId && mutationInfo.operationType === "update") {
      afterSnapshot = await captureBeforeSnapshot(mutationInfo.tableName, rowId);
    }

    await recordAuditEntry({
      agentRunId,
      operationType: mutationInfo.operationType,
      tableName: mutationInfo.tableName,
      rowId,
      beforeSnapshot,
      afterSnapshot: afterSnapshot ?? (resultData ? resultData as Record<string, unknown> : null),
      description: mutationInfo.description,
    });
  }

  return JSON.stringify(result);
}
