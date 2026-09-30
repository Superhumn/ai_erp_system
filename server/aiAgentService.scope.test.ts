import { describe, it, expect, vi, beforeEach } from "vitest";
import { Column, Param, SQL } from "drizzle-orm";
import { vendors, customers, orders, inboundEmails, aiAgentTasks, inventory } from "../drizzle/schema";

// Every db helper the chat may touch is mocked so the proxy never throws on access.
vi.mock("./db", () => {
  const names = [
    "getDb", "createWorkOrder", "createFreightRfq", "createAuditLog",
    "getInventory", "getWarehouses", "getWorkOrders", "getPurchaseOrders", "getVendors", "getCustomers",
    "getOrders", "getInvoices", "getPayments", "getShipments", "getStakeholders", "getEquityGrants",
    "getShareClasses", "getDataRooms", "getDataRoomVisitors", "getProjects", "getAllProjectTasks",
    "getBankTransactions", "getCopackerInvoices", "getCopackerInventoryUpdates", "getEmployees",
    "getContracts", "getCrmContacts", "getCrmDeals", "getCrmPipelines",
  ];
  const m: Record<string, any> = {};
  for (const n of names) m[n] = vi.fn();
  return m;
});
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({ choices: [{ index: 0, message: { role: "assistant", content: "answer" }, finish_reason: "stop" }] }),
  invokeLLMStream: vi.fn(),
}));
vi.mock("./_core/email", () => ({ sendEmail: vi.fn(), formatEmailHtml: vi.fn() }));
vi.mock("./routers/middleware", () => ({ getValidGoogleToken: vi.fn().mockResolvedValue({ error: "not connected" }) }));
vi.mock("./invoicePosting", () => ({ postInvoiceJournalEntry: vi.fn() }));

import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { getValidGoogleToken } from "./routers/middleware";
import { executeTool, gatherQuerySystemContext, chatScope, type AIAgentContext } from "./aiAgentService";

// ---- fake drizzle db ---------------------------------------------------------

type Call = { op: "select" | "update" | "insert"; table: any; where?: any; set?: any; values?: any };
function createFakeDb(rowsFor: (table: any) => any[] = () => []) {
  const calls: Call[] = [];
  let nextId = 100;
  const api: any = {
    calls,
    select() {
      const call: Call = { op: "select", table: undefined };
      const chain: any = {};
      for (const m of ["limit", "orderBy", "groupBy", "offset", "innerJoin", "leftJoin", "for"]) chain[m] = () => chain;
      chain.from = (t: any) => { call.table = t; calls.push(call); return chain; };
      chain.where = (w: any) => { call.where = w; return chain; };
      chain.then = (res: any, rej: any) => Promise.resolve(rowsFor(call.table)).then(res, rej);
      return chain;
    },
    update(table: any) {
      const call: Call = { op: "update", table };
      calls.push(call);
      return { set: (set: any) => { call.set = set; return { where: (w: any) => { call.where = w; return Promise.resolve(); } }; } };
    },
    insert(table: any) {
      return {
        values: (values: any) => {
          const id = nextId++;
          calls.push({ op: "insert", table, values });
          return { $returningId: async () => [{ id }], then: (res: any, rej: any) => Promise.resolve([{ insertId: id }]).then(res, rej) };
        },
      };
    },
    transaction: (fn: any) => fn(api),
  };
  return api as typeof api & { calls: Call[] };
}

// Walk a drizzle SQL tree and report whether it binds `companyId = <value>`.
function collect(node: any, out: { cols: string[]; params: unknown[] }) {
  if (!node || typeof node !== "object") return;
  if (node instanceof Column) { out.cols.push(node.name); return; }
  if (node instanceof Param) { out.params.push(node.value); return; }
  if (node instanceof SQL) { for (const c of node.queryChunks) collect(c, out); return; }
  if (Array.isArray(node)) for (const c of node) collect(c, out);
}
function hasCompanyPredicate(where: unknown, companyId: number): boolean {
  const out = { cols: [] as string[], params: [] as unknown[] };
  collect(where, out);
  return out.cols.includes("companyId") && out.params.includes(companyId);
}
const selectsOn = (fake: any, table: any) => fake.calls.filter((c: Call) => c.op === "select" && c.table === table);

const scoped: AIAgentContext = { userId: 1, userName: "Sam", userRole: "ops", companyId: 7 };
const globalCtx: AIAgentContext = { userId: 1, userName: "Sam", userRole: "ops" };
const entityScope = { mode: "entity", companyIds: [7] };

describe("AI chat company scoping", () => {
  let fake: ReturnType<typeof createFakeDb>;

  beforeEach(() => {
    vi.resetAllMocks();
    fake = createFakeDb();
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ index: 0, message: { role: "assistant", content: "answer" }, finish_reason: "stop" }] } as any);
    vi.mocked(getValidGoogleToken).mockResolvedValue({ error: "not connected" } as any);
    for (const fn of Object.values(db)) {
      if (typeof fn === "function" && "mockResolvedValue" in fn && fn !== db.getDb) (fn as any).mockResolvedValue([]);
    }
  });

  it("chatScope is an entity scope when companyId is set and undefined (global) otherwise", () => {
    expect(chatScope(scoped)).toEqual(entityScope);
    expect(chatScope(globalCtx)).toBeUndefined();
  });

  describe("query_system", () => {
    it("data_room passes the company to getDataRooms", async () => {
      await gatherQuerySystemContext("data_room", scoped);
      expect(db.getDataRooms).toHaveBeenCalledWith(undefined, 7);
      await gatherQuerySystemContext("data_room", globalCtx);
      expect(db.getDataRooms).toHaveBeenLastCalledWith(undefined, undefined);
    });

    it("cap_table passes the company to stakeholders, grants and share classes", async () => {
      await gatherQuerySystemContext("cap_table", scoped);
      expect(db.getStakeholders).toHaveBeenCalledWith(7);
      expect(db.getEquityGrants).toHaveBeenCalledWith(7);
      expect(db.getShareClasses).toHaveBeenCalledWith(7);
    });

    it("banking, employees, projects pass a companyId filter (and none for a global user)", async () => {
      await gatherQuerySystemContext("banking", scoped);
      await gatherQuerySystemContext("employees", scoped);
      await gatherQuerySystemContext("projects", scoped);
      expect(db.getBankTransactions).toHaveBeenCalledWith({ companyId: 7 });
      expect(db.getEmployees).toHaveBeenCalledWith({ companyId: 7 });
      expect(db.getProjects).toHaveBeenCalledWith({ companyId: 7 });

      await gatherQuerySystemContext("employees", globalCtx);
      expect(db.getEmployees).toHaveBeenLastCalledWith(undefined);
    });

    it("projects: tasks (no entity column) are limited to visible projects", async () => {
      vi.mocked(db.getProjects).mockResolvedValue([{ id: 1, name: "Ours", status: "active" }] as any);
      vi.mocked(db.getAllProjectTasks).mockResolvedValue([
        { name: "mine", projectId: 1, status: "todo" },
        { name: "theirs", projectId: 2, status: "todo" },
      ] as any);
      const text = await gatherQuerySystemContext("tasks", scoped);
      expect(text).toContain("Tasks (1)");
      expect(text).toContain("mine");
      expect(text).not.toContain("theirs");
    });

    it("inventory / orders / vendors / customers / invoices use an entity Scope", async () => {
      await gatherQuerySystemContext("inventory", scoped);
      await gatherQuerySystemContext("orders", scoped);
      await gatherQuerySystemContext("general", scoped);
      expect(db.getInventory).toHaveBeenCalledWith(entityScope);
      expect(db.getWarehouses).toHaveBeenCalledWith({ companyId: 7 });
      expect(db.getOrders).toHaveBeenCalledWith(entityScope);
      expect(db.getVendors).toHaveBeenCalledWith(entityScope);
      expect(db.getCustomers).toHaveBeenCalledWith(entityScope);
      expect(db.getInvoices).toHaveBeenCalledWith(entityScope);
      expect(db.getPurchaseOrders).toHaveBeenCalledWith({ companyId: 7 });
    });

    it("work_orders passes companyId to getWorkOrders and the tool still answers through the LLM", async () => {
      const result = await executeTool("query_system", { question: "what's running?", module: "work_orders" }, scoped);
      expect(db.getWorkOrders).toHaveBeenCalledWith({ companyId: 7 });
      expect(result.answer).toBe("answer");
    });

    it("query_crm scopes contacts and deals", async () => {
      await executeTool("query_crm", { question: "pipeline?" }, scoped);
      expect(db.getCrmContacts).toHaveBeenCalledWith({ companyId: 7 });
      expect(db.getCrmDeals).toHaveBeenCalledWith({ companyId: 7 });
    });
  });

  describe("direct drizzle reads carry the companyId predicate", () => {
    it("manage_vendor list", async () => {
      await executeTool("manage_vendor", { action: "list" }, scoped);
      const [call] = selectsOn(fake, vendors);
      expect(hasCompanyPredicate(call.where, 7)).toBe(true);
    });

    it("manage_vendor list is unscoped for a global user", async () => {
      await executeTool("manage_vendor", { action: "list" }, globalCtx);
      const [call] = selectsOn(fake, vendors);
      expect(call.where).toBeUndefined();
    });

    it("manage_customer list", async () => {
      await executeTool("manage_customer", { action: "list" }, scoped);
      const [call] = selectsOn(fake, customers);
      expect(hasCompanyPredicate(call.where, 7)).toBe(true);
    });

    it("analyze_data sales, track_items order and search_inbox", async () => {
      await executeTool("analyze_data", { dataType: "sales", timeRange: "all" }, scoped);
      await executeTool("track_items", { trackingType: "order", identifier: "ORD-1" }, scoped);
      await executeTool("search_inbox", { query: "acme" }, scoped);
      expect(selectsOn(fake, orders).every((c: Call) => hasCompanyPredicate(c.where, 7))).toBe(true);
      expect(selectsOn(fake, orders).length).toBeGreaterThanOrEqual(2);
      const [inbox] = selectsOn(fake, inboundEmails);
      expect(hasCompanyPredicate(inbox.where, 7)).toBe(true);
    });

    it("update_inventory locks the (product, warehouse) cell inside the company", async () => {
      await executeTool("update_inventory", { action: "add", productId: 3, warehouseId: 2, quantity: 5 }, scoped);
      const [sel] = selectsOn(fake, inventory);
      expect(hasCompanyPredicate(sel.where, 7)).toBe(true);
      const ins = fake.calls.find((c: Call) => c.op === "insert" && c.table === inventory);
      expect(ins?.values).toMatchObject({ companyId: 7, productId: 3, warehouseId: 2 });
    });
  });

  describe("writes stamp companyId", () => {
    it("manage_vendor create", async () => {
      await executeTool("manage_vendor", { action: "create", data: { name: "Acme" } }, scoped);
      const ins = fake.calls.find((c: Call) => c.op === "insert" && c.table === vendors);
      expect(ins?.values).toMatchObject({ name: "Acme", companyId: 7 });
    });

    it("create_task", async () => {
      await executeTool("create_task", { taskType: "generate_po", description: "x", taskData: {} }, scoped);
      const ins = fake.calls.find((c: Call) => c.op === "insert" && c.table === aiAgentTasks);
      expect(ins?.values).toMatchObject({ companyId: 7, status: "pending_approval" });
    });
  });

  describe("role gates", () => {
    const user: AIAgentContext = { userId: 9, userName: "Uma", userRole: "user", companyId: 7 };

    it("manage_calendar create_event refuses a non-mutation role but list_events is allowed", async () => {
      await expect(executeTool("manage_calendar", { action: "create_event", summary: "x" }, user)).rejects.toThrow(/Not authorized/);
      await expect(executeTool("manage_calendar", { action: "list_events" }, user)).resolves.toEqual({ error: "Google Calendar not connected" });
      // ops passes the gate (and then hits the missing token, which is fine)
      await expect(executeTool("manage_calendar", { action: "create_event", summary: "x" }, scoped)).resolves.toEqual({ error: "Google Calendar not connected" });
    });

    it("plan_errand: a non-mutation role may queue an errand but it is never auto-approved", async () => {
      const result = await executeTool("plan_errand", { title: "Tidy", goal: "Tidy the vendor list", steps: ["look"], riskLevel: "low" }, user);
      expect(result).toMatchObject({ errandCreated: true, requiresApproval: true, status: "pending_approval" });
      const ins = fake.calls.find((c: Call) => c.op === "insert" && c.table === aiAgentTasks);
      expect(ins?.values).toMatchObject({ status: "pending_approval", requiresApproval: true, companyId: 7 });
    });

    it("plan_errand: a mutation role still gets low-risk auto-approval", async () => {
      const result = await executeTool("plan_errand", { title: "Tidy", goal: "Tidy the vendor list", steps: ["look"], riskLevel: "low" }, scoped);
      expect(result).toMatchObject({ requiresApproval: false, status: "approved" });
    });
  });
});
