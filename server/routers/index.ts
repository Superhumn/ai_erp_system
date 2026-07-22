import { router, mergeRouters } from "../_core/trpc";
import { systemRouter } from "../_core/systemRouter";
import { autonomousWorkflowRouter } from "../autonomousWorkflowRouter";
import { agentRouter } from "../agent";

import { authRouter } from "./auth";
import { financeRouter } from "./finance";
import { salesRouter } from "./sales";
import { crmRouter } from "./crm";
import { operationsRouter } from "./operations";
import { procurementRouter } from "./procurement";
import { manufacturingRouter } from "./manufacturing";
import { freightRouter } from "./freight";
import { ediRouter } from "./edi";
import { emailRouter } from "./email";
import { hrRouter } from "./hr";
import { employeePortalRouter } from "./employeePortal";
import { legalRouter } from "./legal";
import { projectsRouter } from "./projects";
import { taskAssignmentSubRouter } from "./taskAssignment";
import { dataRoomRouter } from "./dataRoom";
import { settingsRouter } from "./settings";
import { aiRouter } from "./ai";
import { boardRouter } from "./board";
import { investorUpdatesRouter } from "./investorUpdates";
import { codeRouter } from "./code";
import { marketingRouter } from "./marketing";

const baseRouter = router({
  system: systemRouter,

  // Autonomous Supply Chain Workflows
  autonomousWorkflows: autonomousWorkflowRouter,

  // Reasoning Agent
  agent: agentRouter,

  // Employee self-service portal
  employeePortal: employeePortalRouter,

  // Human <-> AI task assignment bridge (Lightfield-style task lifecycle)
  taskBridge: taskAssignmentSubRouter,

  // Admin-only AI code IDE (snippets, sandboxed execution, AI actions)
  code: codeRouter,
});

export const appRouter = mergeRouters(
  baseRouter,
  authRouter,
  financeRouter,
  salesRouter,
  crmRouter,
  operationsRouter,
  procurementRouter,
  manufacturingRouter,
  freightRouter,
  ediRouter,
  emailRouter,
  hrRouter,
  legalRouter,
  projectsRouter,
  dataRoomRouter,
  settingsRouter,
  aiRouter,
  boardRouter,
  investorUpdatesRouter,
  marketingRouter,
);

export type AppRouter = typeof appRouter;

// Re-export shared utilities used by other files
export { financeProcedure, opsProcedure, createAuditLog, generateNumber } from "./middleware";
export { router } from "./middleware";
