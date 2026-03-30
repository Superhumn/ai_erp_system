import {
  collectExecutiveKPIs,
  generateStrategicAnalysis,
  generateExecutiveBriefing,
  askExecutiveQuestion,
  departmentDeepDive,
} from "../../../executiveReasoningService";
import type { ToolAdapterResult } from "../../types";

interface ExecutiveInput {
  action: string;
  payload?: {
    focusArea?: string;
    question?: string;
    department?: "finance" | "operations" | "supply_chain" | "sales" | "workforce";
    companyId?: number;
  };
}

/**
 * Executive reasoning adapter — gives the agent COO-level analytical
 * capabilities for strategic decision-making, risk assessment, and
 * cross-functional operational intelligence.
 */
export async function runExecutiveReasoning(input: ExecutiveInput): Promise<ToolAdapterResult> {
  const { action, payload } = input;
  const companyId = payload?.companyId;

  switch (action) {
    case "get_kpis": {
      const kpis = await collectExecutiveKPIs(companyId);
      return { success: true, data: kpis };
    }

    case "strategic_analysis": {
      const analysis = await generateStrategicAnalysis(companyId, payload?.focusArea);
      return { success: true, data: analysis };
    }

    case "executive_briefing": {
      const briefing = await generateExecutiveBriefing(companyId, payload?.focusArea);
      return { success: true, data: briefing };
    }

    case "ask_question": {
      if (!payload?.question) {
        return { success: false, error: "question is required in payload" };
      }
      const answer = await askExecutiveQuestion(payload.question, companyId);
      return { success: true, data: answer };
    }

    case "department_deep_dive": {
      if (!payload?.department) {
        return { success: false, error: "department is required (finance, operations, supply_chain, sales, workforce)" };
      }
      const dive = await departmentDeepDive(payload.department, companyId);
      return { success: true, data: dive };
    }

    default:
      return { success: false, error: `Unknown executive action: ${action}. Available: get_kpis, strategic_analysis, executive_briefing, ask_question, department_deep_dive` };
  }
}
