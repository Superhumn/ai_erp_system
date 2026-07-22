import { getWorkflowEngine } from "../../../autonomousWorkflowEngine";
import { getDb } from "../../../db";
import { supplyChainWorkflows } from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { ToolAdapterInput, ToolAdapterResult } from "../../types";

/**
 * Map workflow type strings to the processor keys used in workflowProcessors.
 */
const WORKFLOW_TYPE_TO_PROCESSOR: Record<string, string> = {
  demand_forecasting: "demandForecasting",
  production_planning: "productionPlanning",
  material_requirements: "materialRequirements",
  procurement: "procurement",
  inventory_reorder: "inventoryReorder",
  inventory_transfer: "inventoryTransfer",
  inventory_optimization: "inventoryOptimization",
  work_order_generation: "workOrderGeneration",
  production_scheduling: "productionScheduling",
  freight_procurement: "freightProcurement",
  shipment_tracking: "shipmentTracking",
  order_fulfillment: "orderFulfillment",
  supplier_management: "supplierManagement",
  quality_inspection: "qualityInspection",
  invoice_matching: "invoiceMatching",
  payment_processing: "paymentProcessing",
  exception_handling: "exceptionHandling",
};

/**
 * Supply chain workflow adapter — triggers an existing autonomous workflow
 * by finding its DB record and running it through the WorkflowEngine.
 */
export async function runSupplyChainWorkflow(input: ToolAdapterInput): Promise<ToolAdapterResult> {
  const { workflowType, inputData } = input as any;

  if (!workflowType) {
    return { success: false, error: "workflowType is required" };
  }

  if (!WORKFLOW_TYPE_TO_PROCESSOR[workflowType]) {
    const available = Object.keys(WORKFLOW_TYPE_TO_PROCESSOR).join(", ");
    return { success: false, error: `Unknown workflowType: "${workflowType}". Available: ${available}` };
  }

  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection unavailable");

    // Find the workflow definition by type
    const [workflow] = await db
      .select()
      .from(supplyChainWorkflows)
      .where(eq(supplyChainWorkflows.workflowType, workflowType))
      .limit(1);

    if (!workflow) {
      return {
        success: false,
        error: `No workflow definition found for type "${workflowType}". The workflow may need to be set up first via the orchestrator.`,
      };
    }

    const engine = await getWorkflowEngine();
    const result = await engine.startWorkflow(
      workflow.id,
      "manual",
      inputData ?? {},
    );

    return {
      success: result.success,
      data: {
        runId: result.runId,
        status: result.status,
        itemsProcessed: result.itemsProcessed,
        itemsSucceeded: result.itemsSucceeded,
        itemsFailed: result.itemsFailed,
        totalValue: result.totalValue,
        outputData: result.outputData,
        pendingApprovals: result.pendingApprovals,
      },
      error: result.error,
    };
  } catch (err) {
    return {
      success: false,
      error: `Workflow execution failed: ${(err as Error).message}`,
    };
  }
}
