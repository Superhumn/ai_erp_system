import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { workflowApprovalQueue, workflowRuns } from "../drizzle/schema";

vi.mock("./db", () => ({ getDb: vi.fn() }));
const processApprovalDecision = vi.fn(async () => ({ success: true, workflowResumed: false }));
vi.mock("./supplyChainOrchestrator", () => ({
  getOrchestrator: () => ({ processApprovalDecision }),
  startOrchestrator: vi.fn(),
  stopOrchestrator: vi.fn(),
}));
vi.mock("./autonomousWorkflowEngine", () => ({ getWorkflowEngine: vi.fn() }));

import { getDb } from "./db";
import { autonomousWorkflowRouter, isApprovalAssignedTo } from "./autonomousWorkflowRouter";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxFor(user: Partial<AuthenticatedUser>): TrpcContext {
  return {
    user: {
      id: 4,
      openId: "u",
      email: "u@example.com",
      name: "U",
      loginMethod: "manus",
      role: "ops",
      companyId: 2,
      regionScope: "global",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...user,
    } as AuthenticatedUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

type Table = object;
function createFakeDb(resolveSelect: (table: Table) => any[]) {
  const selects: Array<{ table: Table; calls: string[] }> = [];
  return {
    selects,
    select() {
      const state = { table: {} as Table, calls: [] as string[] };
      selects.push(state);
      const chain: any = {};
      for (const m of ["where", "limit", "orderBy", "offset", "innerJoin", "leftJoin"]) {
        chain[m] = () => {
          state.calls.push(m);
          return chain;
        };
      }
      chain.from = (t: Table) => {
        state.table = t;
        return chain;
      };
      chain.then = (res: any, rej: any) =>
        Promise.resolve()
          .then(() => resolveSelect(state.table))
          .then(res, rej);
      return chain;
    },
  };
}

describe("isApprovalAssignedTo", () => {
  const user = { id: 4, role: "ops" };

  it("is open to anyone when nothing is assigned", () => {
    expect(isApprovalAssignedTo({ assignedToUsers: null, assignedToRoles: null }, user)).toBe(true);
    expect(isApprovalAssignedTo({ assignedToUsers: "[]", assignedToRoles: "[]" }, user)).toBe(true);
    expect(isApprovalAssignedTo({ assignedToUsers: "not json", assignedToRoles: undefined }, user)).toBe(true);
  });

  it("matches assigned user ids and roles", () => {
    expect(isApprovalAssignedTo({ assignedToUsers: "[4]" }, user)).toBe(true);
    expect(isApprovalAssignedTo({ assignedToUsers: '["4"]' }, user)).toBe(true);
    expect(isApprovalAssignedTo({ assignedToUsers: "[9]" }, user)).toBe(false);
    expect(isApprovalAssignedTo({ assignedToRoles: '["ops"]' }, user)).toBe(true);
    expect(isApprovalAssignedTo({ assignedToRoles: '["finance"]' }, user)).toBe(false);
    expect(isApprovalAssignedTo({ assignedToUsers: "[9]", assignedToRoles: '["ops"]' }, user)).toBe(true);
  });
});

describe("autonomousWorkflow.approvals.approve / reject", () => {
  beforeEach(() => vi.clearAllMocks());

  function approvalDb(approval: Record<string, unknown>) {
    const db = createFakeDb((table) => (table === workflowApprovalQueue ? [approval] : []));
    vi.mocked(getDb).mockResolvedValue(db as any);
    return db;
  }

  it("rejects non-ops roles before looking anything up", async () => {
    const db = approvalDb({ id: 1, assignedToUsers: null, assignedToRoles: null });
    const caller = autonomousWorkflowRouter.createCaller(ctxFor({ role: "sales" }));

    await expect(caller.approvals.approve({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.approvals.reject({ id: 1, reason: "no" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(processApprovalDecision).not.toHaveBeenCalled();
    expect(db.selects).toHaveLength(0);
  });

  it("forbids an ops user who is not among the assigned users/roles", async () => {
    approvalDb({ id: 1, assignedToUsers: "[9]", assignedToRoles: '["finance"]' });
    const caller = autonomousWorkflowRouter.createCaller(ctxFor({ id: 4, role: "ops" }));

    await expect(caller.approvals.approve({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.approvals.reject({ id: 1, reason: "no" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(processApprovalDecision).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND for an unknown approval", async () => {
    vi.mocked(getDb).mockResolvedValue(createFakeDb(() => []) as any);
    const caller = autonomousWorkflowRouter.createCaller(ctxFor({ role: "admin" }));

    await expect(caller.approvals.approve({ id: 404 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(processApprovalDecision).not.toHaveBeenCalled();
  });

  it("lets an assigned user approve and an assigned role reject", async () => {
    approvalDb({ id: 1, assignedToUsers: "[4]", assignedToRoles: null });
    await autonomousWorkflowRouter.createCaller(ctxFor({ id: 4, role: "ops" })).approvals.approve({ id: 1, notes: "ok" });
    expect(processApprovalDecision).toHaveBeenCalledWith(1, true, 4, "ok");

    approvalDb({ id: 2, assignedToUsers: null, assignedToRoles: '["admin"]' });
    await autonomousWorkflowRouter.createCaller(ctxFor({ id: 8, role: "admin" })).approvals.reject({ id: 2, reason: "bad" });
    expect(processApprovalDecision).toHaveBeenCalledWith(2, false, 8, "bad");
  });
});

describe("autonomousWorkflow.runs.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies both filters in a single .where() call", async () => {
    const db = createFakeDb((table) => (table === workflowRuns ? [] : []));
    vi.mocked(getDb).mockResolvedValue(db as any);
    const caller = autonomousWorkflowRouter.createCaller(ctxFor({ role: "ops" }));

    await caller.runs.list({ workflowId: 3, status: "completed" });
    const query = db.selects.find((s) => s.table === workflowRuns);
    expect(query!.calls.filter((c) => c === "where")).toHaveLength(1);

    await caller.runs.list({});
    const unfiltered = db.selects.filter((s) => s.table === workflowRuns)[1];
    expect(unfiltered.calls.filter((c) => c === "where")).toHaveLength(0);
  });
});
