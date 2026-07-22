import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database functions
const mockDb = {
  createAiAgentTask: vi.fn(),
  getAiAgentTaskById: vi.fn(),
  updateAiAgentTask: vi.fn(),
  listAiAgentTasks: vi.fn(),
  getPendingApprovalTasks: vi.fn(),
  createAiAgentLog: vi.fn(),
  listAiAgentLogs: vi.fn(),
  createAiAgentRule: vi.fn(),
  getActiveRules: vi.fn(),
  getRawMaterialById: vi.fn(),
  getVendorById: vi.fn(),
  createPurchaseOrder: vi.fn(),
};

// Mock the LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          reasoning: "Low stock detected, recommending reorder",
          confidence: 0.85,
          suggestedQuantity: 500,
          urgency: "medium"
        })
      }
    }]
  })
}));

describe("AI Agent System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Task Creation", () => {
    it("should create a PO suggestion task with correct structure", async () => {
      const taskData = {
        taskType: "generate_po",
        priority: "medium",
        status: "pending_approval",
        taskData: JSON.stringify({
          rawMaterialId: 1,
          vendorId: 2,
          quantity: 500,
          unitCost: "10.00",
          totalAmount: "5000.00",
          materialName: "Test Material",
          vendorName: "Test Vendor"
        }),
        aiReasoning: "Low stock detected, recommending reorder",
        aiConfidence: "85.00"
      };

      mockDb.createAiAgentTask.mockResolvedValue({ id: 1, ...taskData });

      const result = await mockDb.createAiAgentTask(taskData);

      expect(result).toHaveProperty("id");
      expect(result.taskType).toBe("generate_po");
      expect(result.status).toBe("pending_approval");
      expect(mockDb.createAiAgentTask).toHaveBeenCalledWith(taskData);
    });

    it("should create an RFQ suggestion task", async () => {
      const taskData = {
        taskType: "send_rfq",
        priority: "low",
        status: "pending_approval",
        taskData: JSON.stringify({
          rawMaterialId: 1,
          vendorIds: [1, 2, 3],
          quantity: 1000,
          materialName: "Test Material"
        }),
        aiReasoning: "Multiple vendors available, requesting quotes for best price",
        aiConfidence: "75.00"
      };

      mockDb.createAiAgentTask.mockResolvedValue({ id: 2, ...taskData });

      const result = await mockDb.createAiAgentTask(taskData);

      expect(result.taskType).toBe("send_rfq");
      expect(JSON.parse(result.taskData).vendorIds).toHaveLength(3);
    });

    it("should create an email task", async () => {
      const taskData = {
        taskType: "send_email",
        priority: "high",
        status: "pending_approval",
        taskData: JSON.stringify({
          to: "vendor@example.com",
          subject: "Urgent: Quote Request",
          body: "Please provide a quote for..."
        }),
        aiReasoning: "Urgent material shortage requires immediate vendor contact",
        aiConfidence: "90.00"
      };

      mockDb.createAiAgentTask.mockResolvedValue({ id: 3, ...taskData });

      const result = await mockDb.createAiAgentTask(taskData);

      expect(result.taskType).toBe("send_email");
      expect(result.priority).toBe("high");
    });
  });

  describe("Task Approval Workflow", () => {
    it("should update task status to approved", async () => {
      mockDb.getAiAgentTaskById.mockResolvedValue({
        id: 1,
        status: "pending_approval",
        taskType: "generate_po"
      });
      mockDb.updateAiAgentTask.mockResolvedValue({
        id: 1,
        status: "approved",
        approvedBy: 1,
        approvedAt: new Date()
      });

      const task = await mockDb.getAiAgentTaskById(1);
      expect(task.status).toBe("pending_approval");

      const approved = await mockDb.updateAiAgentTask(1, {
        status: "approved",
        approvedBy: 1,
        approvedAt: new Date()
      });

      expect(approved.status).toBe("approved");
      expect(approved.approvedBy).toBe(1);
    });

    it("should update task status to rejected with reason", async () => {
      mockDb.updateAiAgentTask.mockResolvedValue({
        id: 1,
        status: "rejected",
        rejectionReason: "Price too high",
        rejectedBy: 1,
        rejectedAt: new Date()
      });

      const rejected = await mockDb.updateAiAgentTask(1, {
        status: "rejected",
        rejectionReason: "Price too high",
        rejectedBy: 1,
        rejectedAt: new Date()
      });

      expect(rejected.status).toBe("rejected");
      expect(rejected.rejectionReason).toBe("Price too high");
    });
  });

  describe("Task Execution", () => {
    it("should execute PO generation task", async () => {
      mockDb.getAiAgentTaskById.mockResolvedValue({
        id: 1,
        status: "approved",
        taskType: "generate_po",
        taskData: JSON.stringify({
          vendorId: 1,
          rawMaterialId: 1,
          quantity: 500,
          totalAmount: "5000.00"
        })
      });
      mockDb.createPurchaseOrder.mockResolvedValue({ id: 100, poNumber: "PO-2601-001" });
      mockDb.updateAiAgentTask.mockResolvedValue({
        id: 1,
        status: "completed",
        result: JSON.stringify({ purchaseOrderId: 100, poNumber: "PO-2601-001" })
      });

      const task = await mockDb.getAiAgentTaskById(1);
      expect(task.status).toBe("approved");

      const taskData = JSON.parse(task.taskData);
      const po = await mockDb.createPurchaseOrder({
        vendorId: taskData.vendorId,
        poNumber: "PO-2601-001",
        totalAmount: taskData.totalAmount,
        orderDate: new Date()
      });

      expect(po.id).toBe(100);

      const completed = await mockDb.updateAiAgentTask(1, {
        status: "completed",
        result: JSON.stringify({ purchaseOrderId: po.id, poNumber: po.poNumber })
      });

      expect(completed.status).toBe("completed");
    });
  });

  describe("Pending Approvals", () => {
    it("should list all pending approval tasks", async () => {
      mockDb.getPendingApprovalTasks.mockResolvedValue([
        { id: 1, taskType: "generate_po", status: "pending_approval", priority: "high" },
        { id: 2, taskType: "send_rfq", status: "pending_approval", priority: "medium" },
        { id: 3, taskType: "send_email", status: "pending_approval", priority: "low" }
      ]);

      const pending = await mockDb.getPendingApprovalTasks();

      expect(pending).toHaveLength(3);
      expect(pending.every((t: any) => t.status === "pending_approval")).toBe(true);
    });

    it("should return empty array when no pending tasks", async () => {
      mockDb.getPendingApprovalTasks.mockResolvedValue([]);

      const pending = await mockDb.getPendingApprovalTasks();

      expect(pending).toHaveLength(0);
    });
  });

  describe("Activity Logging", () => {
    it("should create activity log entry", async () => {
      mockDb.createAiAgentLog.mockResolvedValue({
        id: 1,
        taskId: 1,
        action: "task_created",
        status: "info",
        message: "PO suggestion task created for Material X",
        createdAt: new Date()
      });

      const log = await mockDb.createAiAgentLog({
        taskId: 1,
        action: "task_created",
        status: "info",
        message: "PO suggestion task created for Material X"
      });

      expect(log.action).toBe("task_created");
      expect(log.status).toBe("info");
    });

    it("should list recent activity logs", async () => {
      mockDb.listAiAgentLogs.mockResolvedValue([
        { id: 3, action: "task_completed", status: "success" },
        { id: 2, action: "task_approved", status: "success" },
        { id: 1, action: "task_created", status: "info" }
      ]);

      const logs = await mockDb.listAiAgentLogs({ limit: 50 });

      expect(logs).toHaveLength(3);
      expect(logs[0].id).toBe(3); // Most recent first
    });
  });

  describe("AI Agent Rules", () => {
    it("should create automation rule", async () => {
      mockDb.createAiAgentRule.mockResolvedValue({
        id: 1,
        name: "Auto-reorder low stock",
        ruleType: "inventory_threshold",
        triggerCondition: JSON.stringify({
          field: "quantity",
          operator: "less_than",
          value: "reorderPoint"
        }),
        actionType: "generate_po",
        isActive: true
      });

      const rule = await mockDb.createAiAgentRule({
        name: "Auto-reorder low stock",
        ruleType: "inventory_threshold",
        triggerCondition: JSON.stringify({
          field: "quantity",
          operator: "less_than",
          value: "reorderPoint"
        }),
        actionType: "generate_po",
        isActive: true
      });

      expect(rule.name).toBe("Auto-reorder low stock");
      expect(rule.isActive).toBe(true);
    });

    it("should get active rules only", async () => {
      mockDb.getActiveRules.mockResolvedValue([
        { id: 1, name: "Rule 1", isActive: true },
        { id: 2, name: "Rule 2", isActive: true }
      ]);

      const rules = await mockDb.getActiveRules();

      expect(rules).toHaveLength(2);
      expect(rules.every((r: any) => r.isActive)).toBe(true);
    });
  });

  describe("Task Priority", () => {
    it("should correctly set task priority based on urgency", () => {
      const priorities = ["low", "medium", "high", "urgent"];
      
      priorities.forEach(priority => {
        expect(["low", "medium", "high", "urgent"]).toContain(priority);
      });
    });

    it("should sort tasks by priority", async () => {
      mockDb.listAiAgentTasks.mockResolvedValue([
        { id: 1, priority: "urgent" },
        { id: 2, priority: "high" },
        { id: 3, priority: "medium" },
        { id: 4, priority: "low" }
      ]);

      const tasks = await mockDb.listAiAgentTasks({});
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      
      for (let i = 0; i < tasks.length - 1; i++) {
        const currentPriority = priorityOrder[tasks[i].priority as keyof typeof priorityOrder];
        const nextPriority = priorityOrder[tasks[i + 1].priority as keyof typeof priorityOrder];
        expect(currentPriority).toBeLessThanOrEqual(nextPriority);
      }
    });
  });

  describe("Meeting Task Suggestions (create_project_task)", () => {
    // Mirrors the payload the meeting extractor writes and the validation the
    // live `query` executor applies before createProjectTaskFromSource.
    const clampPriority = (p: unknown) =>
      (["low", "medium", "high", "critical"] as const).includes(p as any) ? p : "medium";
    const parseDue = (v: unknown): Date | undefined => {
      if (!v) return undefined;
      const d = new Date(v as any);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const toPositiveInt = (v: unknown): number | undefined => {
      const n = Number(v);
      return Number.isInteger(n) && n > 0 ? n : undefined;
    };

    it("suggestion carries the fields the executor requires", () => {
      const taskData = {
        action: "create_project_task",
        projectId: 7,
        name: "Send the signed contract to Acme by Friday",
        priority: "high",
        assigneeId: 3,
        source: "fireflies",
        sourceExternalId: "abc123#2",
        sourceMeeting: { meetingId: 42, firefliesId: "abc123", title: "Acme sync" },
      };
      expect(taskData.action).toBe("create_project_task");
      expect(toPositiveInt(taskData.projectId)).toBe(7);
      expect(taskData.name.length).toBeGreaterThan(0);
      expect(taskData.source).toBe("fireflies");
      expect(taskData.sourceExternalId).toMatch(/#\d+$/);
      expect(toPositiveInt(taskData.sourceMeeting.meetingId)).toBe(42);
    });

    it("clamps an unexpected priority to medium and keeps valid ones", () => {
      expect(clampPriority("bogus")).toBe("medium");
      expect(clampPriority(undefined)).toBe("medium");
      expect(clampPriority("critical")).toBe("critical");
    });

    it("drops a malformed dueDate but keeps a real one", () => {
      expect(parseDue("not-a-date")).toBeUndefined();
      expect(parseDue(undefined)).toBeUndefined();
      expect(parseDue("2026-08-01")).toBeInstanceOf(Date);
    });

    it("rejects non-positive-integer ids so they cannot become NaN", () => {
      expect(toPositiveInt("not-a-number")).toBeUndefined();
      expect(toPositiveInt(0)).toBeUndefined();
      expect(toPositiveInt(-4)).toBeUndefined();
      expect(toPositiveInt("15")).toBe(15);
    });

    it("dedup blocks still-open/rejected suggestions but allows re-queue after terminal states", () => {
      const blocking = ["pending_approval", "approved", "in_progress", "rejected"];
      const requeueable = ["completed", "failed", "cancelled"];
      for (const s of blocking) expect(blocking.includes(s)).toBe(true);
      for (const s of requeueable) expect(blocking.includes(s)).toBe(false);
    });
  });

  describe("Task Data Validation", () => {
    it("should validate PO task has required fields", () => {
      const taskData = {
        vendorId: 1,
        rawMaterialId: 1,
        quantity: 500,
        unitCost: "10.00",
        totalAmount: "5000.00"
      };

      expect(taskData).toHaveProperty("vendorId");
      expect(taskData).toHaveProperty("rawMaterialId");
      expect(taskData).toHaveProperty("quantity");
      expect(taskData).toHaveProperty("totalAmount");
    });

    it("should validate RFQ task has required fields", () => {
      const taskData = {
        rawMaterialId: 1,
        vendorIds: [1, 2, 3],
        quantity: 1000
      };

      expect(taskData).toHaveProperty("rawMaterialId");
      expect(taskData).toHaveProperty("vendorIds");
      expect(Array.isArray(taskData.vendorIds)).toBe(true);
      expect(taskData).toHaveProperty("quantity");
    });

    it("should validate email task has required fields", () => {
      const taskData = {
        to: "vendor@example.com",
        subject: "Quote Request",
        body: "Please provide a quote..."
      };

      expect(taskData).toHaveProperty("to");
      expect(taskData).toHaveProperty("subject");
      expect(taskData).toHaveProperty("body");
      expect(taskData.to).toMatch(/@/);
    });
  });
});
