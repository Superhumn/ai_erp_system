import { runSalesPipelineWorkflow } from "./adapters/sales";
import { runFinanceWorkflow } from "./adapters/finance";
import { queryDatabase } from "./adapters/db";
import { runSupplyChainWorkflow } from "./adapters/supplyChain";
import type { ToolAdapterInput } from "../types";

/**
 * Dispatches a tool call to the appropriate adapter.
 * Returns the result as a JSON string for the agent message history.
 */
export async function dispatchTool(name: string, input: unknown): Promise<string> {
  const i = input as ToolAdapterInput;

  switch (name) {
    case "run_sales_pipeline_workflow":
      return JSON.stringify(await runSalesPipelineWorkflow(i));
    case "run_finance_workflow":
      return JSON.stringify(await runFinanceWorkflow(i));
    case "query_database":
      return JSON.stringify(await queryDatabase(i));
    case "run_supply_chain_workflow":
      return JSON.stringify(await runSupplyChainWorkflow(i));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
